/*
Node-OpenDroneMap Node.js App and REST API to access OpenDroneMap.
Copyright (C) 2016 Node-OpenDroneMap Contributors

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
"use strict";
let assert = require('assert');
let fs = require('fs');
let rmdir = require('rimraf');
let odmRunner = require('./odmRunner');
let archiver = require('archiver');

let statusCodes = require('./statusCodes');

module.exports = class Task{
	constructor(uuid, name, done){
		assert(uuid !== undefined, "uuid must be set");
		assert(done !== undefined, "ready must be set");

		this.uuid = uuid;
		this.name = name != "" ? name : "Task of " + (new Date()).toISOString();
		this.dateCreated = new Date().getTime();
		this.processingTime = -1;
		this.setStatus(statusCodes.QUEUED);
		this.options = {};
		this.output = [];
		this.runnerProcess = null;

		// Read images info
		fs.readdir(this.getImagesFolderPath(), (err, files) => {
			if (err) done(err);
			else{
				this.images = files;
				done(null, this);
			}
		});
	}

	static CreateFromSerialized(taskJson, done){
		new Task(taskJson.uuid, taskJson.name, (err, task) => {
			if (err) done(err);
			else{
				// Override default values with those
				// provided in the taskJson
				for (let k in taskJson){
					task[k] = taskJson[k];
				}

				// Tasks that were running should be put back to QUEUED state
				if (task.status.code === statusCodes.RUNNING){
					task.status.code = statusCodes.QUEUED;
				}
				done(null, task);
			}
		})
	}

	// Get path where images are stored for this task
	// (relative to nodejs process CWD)
	getImagesFolderPath(){
		return `${this.getProjectFolderPath()}/images`;
	}

	// Get path of project (where all images and assets folder are contained)
	// (relative to nodejs process CWD)
	getProjectFolderPath(){
		return `data/${this.uuid}`;
	}

	// Get the path of the archive where all assets
	// outputted by this task are stored.
	getAssetsArchivePath(){
		return `${this.getProjectFolderPath()}/all.zip`;
	}

	// Deletes files and folders related to this task
	cleanup(cb){
		rmdir(this.getProjectFolderPath(), cb);
	}

	setStatus(code, extra){
		this.status = {
			code: code
		};
		for (let k in extra){
			this.status[k] = extra[k];
		}
	}

	updateProcessingTime(resetTime){
		this.processingTime = resetTime ?
								-1		:
								new Date().getTime() - this.dateCreated;
	}

	startTrackingProcessingTime(){
		this.updateProcessingTime();
		if (!this._updateProcessingTimeInterval){
			this._updateProcessingTimeInterval = setInterval(() => {
				this.updateProcessingTime();
			}, 1000);
		}
	}

	stopTrackingProcessingTime(resetTime){
		this.updateProcessingTime(resetTime);
		if (this._updateProcessingTimeInterval){
			clearInterval(this._updateProcessingTimeInterval);
			this._updateProcessingTimeInterval = null;
		}
	}

	getStatus(){
		return this.status.code;
	}

	isCanceled(){
		return this.status.code === statusCodes.CANCELED;
	}

	// Cancels the current task (unless it's already canceled)
	cancel(cb){
		if (this.status.code !== statusCodes.CANCELED){
			let wasRunning = this.status.code === statusCodes.RUNNING;
			this.setStatus(statusCodes.CANCELED);

			if (wasRunning && this.runnerProcess){
				// TODO: this does guarantee that
				// the process will immediately terminate.
				// In fact, often times ODM will continue running for a while
				// This might need to be fixed on ODM's end.
				this.runnerProcess.kill('SIGINT');
				this.runnerProcess = null;
			}

			this.stopTrackingProcessingTime(true);
			cb(null);
		}else{
			cb(new Error("Task already cancelled"));
		}
	}

	// Starts processing the task with OpenDroneMap
	// This will spawn a new process.
	start(done){
		const postProcess = () => {
			let output = fs.createWriteStream(this.getAssetsArchivePath());
			let archive = archiver.create('zip', {});

			archive.on('finish', () => {
				// TODO: is this being fired twice?
				this.setStatus(statusCodes.COMPLETED);
				finished();
			});

			archive.on('error', err => {
				this.setStatus(statusCodes.FAILED);
				finished(err);
			});

			archive.pipe(output);
			archive
			  .directory(`${this.getProjectFolderPath()}/odm_orthophoto`, 'odm_orthophoto')
			  .directory(`${this.getProjectFolderPath()}/odm_georeferencing`, 'odm_georeferencing')
			  .directory(`${this.getProjectFolderPath()}/odm_texturing`, 'odm_texturing')
			  .directory(`${this.getProjectFolderPath()}/odm_meshing`, 'odm_meshing')
			  .finalize();
		};

		const finished = err => {
			this.stopTrackingProcessingTime();
			done(err);
		};

		if (this.status.code === statusCodes.QUEUED){
			this.startTrackingProcessingTime();
			this.setStatus(statusCodes.RUNNING);
			this.runnerProcess = odmRunner.run({
					projectPath: `${__dirname}/../${this.getProjectFolderPath()}`
				}, (err, code, signal) => {
					if (err){
						this.setStatus(statusCodes.FAILED, {errorMessage: `Could not start process (${err.message})`});
						finished();
					}else{
						// Don't evaluate if we caused the process to exit via SIGINT?
						if (this.status.code !== statusCodes.CANCELED){
							if (code === 0){
								postProcess();
							}else{
								this.setStatus(statusCodes.FAILED, {errorMessage: `Process exited with code ${code}`});
								finished();
							}
						}else{
							finished();
						}
					}
				}, output => {
					// Replace console colors
					output = output.replace(/\x1b\[[0-9;]*m/g, "");
					this.output.push(output);
				});

			return true;
		}else{
			return false;
		}
	}

	// Re-executes the task (by setting it's state back to QUEUED)
	// Only tasks that have been canceled or have failed can be restarted.
	restart(cb){
		if (this.status.code === statusCodes.CANCELED || this.status.code === statusCodes.FAILED){
			this.setStatus(statusCodes.QUEUED);
			this.dateCreated = new Date().getTime();
			this.output = [];
			this.stopTrackingProcessingTime(true);
			cb(null);
		}else{
			cb(new Error("Task cannot be restarted"));
		}
	}

	// Returns the description of the task.
	getInfo(){
		return {
			uuid: this.uuid,
			name: this.name,
			dateCreated: this.dateCreated,
			processingTime: this.processingTime,
			status: this.status,
			options: this.options,
			imagesCount: this.images.length
		}
	}

	// Returns the output of the OpenDroneMap process
	// Optionally starting from a certain line number
	getOutput(startFromLine = 0){
		return this.output.slice(startFromLine, this.output.length);
	}

	// Returns the data necessary to serialize this
	// task to restore it later.
	serialize(){
		return {
			uuid: this.uuid,
			name: this.name,
			dateCreated: this.dateCreated,
			status: this.status,
			options: this.options
		}
	}
};
