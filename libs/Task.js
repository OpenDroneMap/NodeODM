"use strict";
let assert = require('assert');
let fs = require('fs');
let odmRunner = require('./odmRunner');

let statusCodes = require('./statusCodes');

module.exports = class Task{
	constructor(uuid, name, readyCb){
		assert(uuid !== undefined, "uuid must be set");
		assert(readyCb !== undefined, "ready must be set");

		this.uuid = uuid;
		this.name = name != "" ? name : "Task of " + (new Date()).toISOString();
		this.dateCreated = new Date().getTime();
		this.status = {
			code: statusCodes.QUEUED
		};
		this.options = {};
		this.output = [];
		this.runnerProcess = null;

		// Read images info
		fs.readdir(this.getImagesFolderPath(), (err, files) => {
			if (err) readyCb(err);
			else{
				this.images = files;
				readyCb(null, this);
			}
		});
	}

	// Get path where images are stored for this task
	// (relative to nodejs process CWD)
	getImagesFolderPath(){
		return `data/${this.uuid}/images`;
	}

	setStatus(code, extra){
		this.status = {
			code: code
		};
		for (var k in extra){
			this.status[k] = extra[k];
		}
	}

	getStatus(){
		return this.status.code;
	}

	// Cancels the current task (unless it's already canceled)
	cancel(cb){
		if (this.status.code !== statusCodes.CANCELED){
			this.setStatus(statusCodes.CANCELED);

			console.log("Requested to cancel " + this.name);
			// TODO
			cb(null);
		}else{
			cb(new Error("Task already cancelled"));
		}
	}

	// Starts processing the task with OpenDroneMap
	// This will spawn a new process.
	start(done){
		if (this.status.code === statusCodes.QUEUED){
			this.setStatus(statusCodes.RUNNING);
			this.runnerProcess = odmRunner.run({
					projectPath: `${__dirname}/../${this.getImagesFolderPath()}`
				}, (err, code, signal) => {
					if (err){
						this.setStatus(statusCodes.FAILED, {errorMessage: `Could not start process (${err.message})`});
					}else{
						if (code === 0){
							this.setStatus(statusCodes.COMPLETED);
						}else{
							this.setStatus(statusCodes.FAILED, {errorMessage: `Process exited with code ${code}`});
						}
					}
					done();
				}, output => {
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

			console.log("Requested to restart " + this.name);
			// TODO

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
			status: this.status,
			options: this.options,
			imagesCount: this.images.length
		}
	}

	// Returns the output of the OpenDroneMap process
	// Optionally starting from a certain line number
	getOutput(startFromLine = 0){
		let lineNum = Math.min(this.output.length, startFromLine);
		return this.output.slice(lineNum, this.output.length);
	}
};