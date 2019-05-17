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

const config = require('../config');
const async = require('async');
const assert = require('assert');
const logger = require('./logger');
const fs = require('fs');
const glob = require("glob");
const path = require('path');
const rmdir = require('rimraf');
const odmRunner = require('./odmRunner');
const odmInfo = require('./odmInfo');
const processRunner = require('./processRunner');
const archiver = require('archiver');
const Directories = require('./Directories');
const kill = require('tree-kill');
const S3 = require('./S3');
const request = require('request');
const utils = require('./utils');

const statusCodes = require('./statusCodes');

module.exports = class Task{
    constructor(uuid, name, options = [], webhook = null, skipPostProcessing = false, outputs = [], done = () => {}){
        assert(uuid !== undefined, "uuid must be set");
        assert(done !== undefined, "ready must be set");

        this.uuid = uuid;
        this.name = name !== "" ? name : "Task of " + (new Date()).toISOString();
        this.dateCreated = new Date().getTime();
        this.processingTime = -1;
        this.setStatus(statusCodes.QUEUED);
        this.options = options;
        this.gcpFiles = [];
        this.output = [];
        this.runningProcesses = [];
        this.webhook = webhook;
        this.skipPostProcessing = skipPostProcessing;
        this.outputs = utils.parseUnsafePathsList(outputs);
        this.progress = 0;
        
        async.series([
            // Read images info
            cb => {
                fs.readdir(this.getImagesFolderPath(), (err, files) => {
                    if (err) cb(err);
                    else{
                        this.images = files;
                        logger.debug(`Found ${this.images.length} images for ${this.uuid}`);
                        cb(null);
                    }
                });
            },

            // Find GCP (if any)
            cb => {
                fs.readdir(this.getGcpFolderPath(), (err, files) => {
                    if (err) cb(err);
                    else{
                        files.forEach(file => {
                            if (/\.txt$/gi.test(file)){
                                this.gcpFiles.push(file);
                            }
                        });
                        logger.debug(`Found ${this.gcpFiles.length} GCP files (${this.gcpFiles.join(" ")}) for ${this.uuid}`);
                        cb(null);
                    }
                });
            },

            // Populate stage progress
            cb => {
                odmInfo.getPipelineStages((err, pstages) => {
                    if (!err) this.stages = pstages.map(ps => { return {
                                                            id: ps,
                                                            status: statusCodes.QUEUED,
                                                            progress: 0
                                                        }});
                    else this.stages = [];
                    cb();
                }); 
            }
        ], err => {
            done(err, this);
        });
    }

    static CreateFromSerialized(taskJson, done){
        // TODO: serialize progress
        // TODO: on task start, reset progress
        // TODO: handle on complete, on fail, on cancel progress update
        new Task(taskJson.uuid, 
            taskJson.name, 
            taskJson.options, 
            taskJson.webhook, 
            taskJson.skipPostProcessing,
            taskJson.outputs,
            (err, task) => {
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
            });
    }

    // Get path where images are stored for this task
    // (relative to nodejs process CWD)
    getImagesFolderPath(){
        return path.join(this.getProjectFolderPath(), "images");
    }

    // Get path where GCP file(s) are stored
    // (relative to nodejs process CWD)
    getGcpFolderPath(){
        return path.join(this.getProjectFolderPath(), "gcp");
    }

    // Get path of project (where all images and assets folder are contained)
    // (relative to nodejs process CWD)
    getProjectFolderPath(){
        return path.join(Directories.data, this.uuid);
    }

    // Get the path of the archive where all assets
    // outputted by this task are stored.
    getAssetsArchivePath(filename){
        if (filename == 'all.zip'){
            // OK, do nothing
        }else if (filename == 'orthophoto.tif'){
            if (config.test){
                if (config.testSkipOrthophotos) return false;
                else filename = path.join('..', '..', 'processing_results', 'odm_orthophoto', `odm_${filename}`);
            }else{
                filename = path.join('odm_orthophoto', `odm_${filename}`);
            }
        }else{
            return false; // Invalid
        }
        
        return path.join(this.getProjectFolderPath(), filename);
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

    updateProgress(globalProgress, stageProgress, stage){
        globalProgress = Math.min(100, Math.max(0, globalProgress));
        stageProgress = Math.min(100, Math.max(0, stageProgress));
        
        // Progress updates are asynchronous (via UDP)
        // so things could be out of order. We ignore all progress
        // updates that are lower than what we might have previously received.
        if (globalProgress >= this.progress){
            this.progress = globalProgress;
            
            // Process only if we don't know what the stages are
            if (this.stages.length){
                let i = 0;
                for (i = 0; i < this.stages.length; i++){
                    let s = this.stages[i];
                    if (s.id === stage){
                        // Update progress
                        s.progress = stageProgress;
                        
                        // If this one completed, make sure previous stages are also completed
                        // and that the next stage (if any) is running
                        if (stageProgress === 100){
                            s.status = statusCodes.COMPLETED;
                            for (let j = i; j >= 0; j--){
                                this.stages[j].status = s.status;
                                this.stages[j].progress = 100
                            }
                            if (i < this.stages.length - 1){
                                this.stages[i + 1].status = statusCodes.RUNNING;
                                this.stages[i + 1].progress = 0
                            }
                        }else{
                            s.status = statusCodes.RUNNING;
                        }
                        return;
                    }
                }

                // This should never happen
                logger.warn(`Invalid progress update for stage: ${stage}|${globalProgress}|${stageProgress}`);
            }
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

            if (wasRunning){
                this.runningProcesses.forEach(proc => {
                    // TODO: this does NOT guarantee that
                    // the process will immediately terminate.
                    // For eaxmple in the case of the ODM process, the process will continue running for a while
                    // This might need to be fixed on ODM's end.
                    
                    // During testing, proc is undefined
                    if (proc) kill(proc.pid);
                });
                this.runningProcesses = [];
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
        const finished = err => {
            this.stopTrackingProcessingTime();
            done(err);
        };
        
        const postProcess = () => {
            const createZipArchive = (outputFilename, files) => {
                return (done) => {
                    this.output.push(`Compressing ${outputFilename}\n`);

                    let output = fs.createWriteStream(this.getAssetsArchivePath(outputFilename));
                    let archive = archiver.create('zip', {
                            zlib: { level: 1 } // Sets the compression level (1 = best speed since most assets are already compressed)
                        });

                    archive.on('finish', () => {
                        // TODO: is this being fired twice?
                        done();
                    });

                    archive.on('error', err => {
                        logger.error(`Could not archive .zip file: ${err.message}`);
                        done(err);
                    });

                    archive.pipe(output);
                    let globs = [];
                    
                    const sourcePath = !config.test ? 
                                        this.getProjectFolderPath() : 
                                        path.join("tests", "processing_results");

                    // Process files and directories first
                    files.forEach(file => {
                        let filePath = path.join(sourcePath, file);
                        
                        // Skip non-existing items
                        if (!fs.existsSync(filePath)) return;

                        let isGlob = /\*/.test(file),
                            isDirectory = !isGlob && fs.lstatSync(filePath).isDirectory();

                        if (isDirectory){
                            archive.directory(filePath, file);
                        }else if (isGlob){
                            globs.push(filePath);
                        }else{
                            archive.file(filePath, {name: file});
                        }
                    });

                    // Check for globs
                    if (globs.length !== 0){
                        let pending = globs.length;

                        globs.forEach(pattern => {
                            glob(pattern, (err, files) => {
                                if (err) done(err);
                                else{
                                    files.forEach(file => {
                                        if (fs.lstatSync(file).isFile()){
                                            archive.file(file, {name: path.basename(file)});
                                        }else{
                                            logger.debug(`Could not add ${file} from glob`);
                                        }
                                    });

                                    if (--pending === 0){
                                        archive.finalize();
                                    }
                                }
                            });
                        });
                    }else{
                        archive.finalize();
                    }
                };
            };

            const runPostProcessingScript = () => {
                return (done) => {
                    this.runningProcesses.push(
                        processRunner.runPostProcessingScript({
                            projectFolderPath: this.getProjectFolderPath() 
                        }, (err, code, signal) => {
                            if (err) done(err);
                            else{
                                if (code === 0) done();
                                else done(new Error(`Process exited with code ${code}`));
                            }
                        }, output => {
                            this.output.push(output);
                        })
                    );
                };
            };

            // All paths are relative to the project directory (./data/<uuid>/)
            let allPaths = ['odm_orthophoto/odm_orthophoto.tif', 'odm_orthophoto/odm_orthophoto.mbtiles',
                              'odm_georeferencing', 'odm_texturing',
                              'odm_dem/dsm.tif', 'odm_dem/dtm.tif', 'dsm_tiles', 'dtm_tiles',
                              'orthophoto_tiles', 'potree_pointcloud', 'images.json'];
            
            // Did the user request different outputs than the default?
            if (this.outputs.length > 0) allPaths = this.outputs;

            let tasks = [];
            
            if (config.test){
                if (config.testSkipOrthophotos){
                    logger.info("Test mode will skip orthophoto generation");

                    // Exclude these folders from the all.zip archive
                    ['odm_orthophoto', 'orthophoto_tiles'].forEach(dir => {
                        allPaths.splice(allPaths.indexOf(dir), 1);
                    });
                }
                
                if (config.testSkipDems){
                    logger.info("Test mode will skip DEMs generation");

                    // Exclude these folders from the all.zip archive
                    ['odm_dem/dsm.tif', 'odm_dem/dtm.tif', 'dsm_tiles', 'dtm_tiles'].forEach(p => {
                        allPaths.splice(allPaths.indexOf(p), 1);
                    });
                }

                if (config.testFailTasks){
                    logger.info("Test mode will fail the task");
                    tasks.push(done => done(new Error("Test fail")));
                }
            }
            
            if (!this.skipPostProcessing) tasks.push(runPostProcessingScript());
            tasks.push(createZipArchive('all.zip', allPaths));
            
            // Upload to S3 all paths + all.zip file (if config says so)
            if (S3.enabled()){
                tasks.push((done) => {
                    let s3Paths;
                    if (config.test){
                        s3Paths = ['all.zip']; // During testing only upload all.zip
                    }else if (config.s3UploadEverything){
                        s3Paths = ['all.zip'].concat(allPaths);
                    }else{
                        s3Paths = ['all.zip', 'odm_orthophoto/odm_orthophoto.tif'];
                    }
                    
                    S3.uploadPaths(this.getProjectFolderPath(), config.s3Bucket, this.uuid, s3Paths, 
                        err => {
                            if (!err) this.output.push("Done uploading to S3!");
                            done(err);
                        }, output => this.output.push(output));
                });
            }

            async.series(tasks, (err) => {
                if (!err){
                    this.setStatus(statusCodes.COMPLETED);
                    finished();
                }else{
                    this.setStatus(statusCodes.FAILED);
                    finished(err);
                }
            });
        };

        if (this.status.code === statusCodes.QUEUED){
            this.startTrackingProcessingTime();
            this.setStatus(statusCodes.RUNNING);

            let runnerOptions = this.options.reduce((result, opt) => {
                result[opt.name] = opt.value;
                return result;
            }, {});

            runnerOptions["project-path"] = fs.realpathSync(Directories.data);

            if (this.gcpFiles.length > 0){
                runnerOptions.gcp = fs.realpathSync(path.join(this.getGcpFolderPath(), this.gcpFiles[0]));
            }

            this.runningProcesses.push(odmRunner.run(runnerOptions, this.uuid, (err, code, signal) => {
                    if (err){
                        this.setStatus(statusCodes.FAILED, {errorMessage: `Could not start process (${err.message})`});
                        finished(err);
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

                    // Split lines and trim
                    output.trim().split('\n').forEach(line => {
                        this.output.push(line.trim());
                    });
                })
            );

            return true;
        }else{
            return false;
        }
    }

    // Re-executes the task (by setting it's state back to QUEUED)
    // Only tasks that have been canceled, completed or have failed can be restarted.
    restart(options, cb){
        if ([statusCodes.CANCELED, statusCodes.FAILED, statusCodes.COMPLETED].indexOf(this.status.code) !== -1){
            this.setStatus(statusCodes.QUEUED);
            this.dateCreated = new Date().getTime();
            this.output = [];
            this.stopTrackingProcessingTime(true);
            if (options !== undefined) this.options = options;
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
            imagesCount: this.images.length,
            progress: this.progress,
            stages: this.stages
        };
    }

    // Returns the output of the OpenDroneMap process
    // Optionally starting from a certain line number
    getOutput(startFromLine = 0){
        return this.output.slice(startFromLine, this.output.length);
    }
    
    // Reads the contents of the tasks's 
    // images.json and returns its JSON representation
    readImagesDatabase(callback){
        const imagesDbPath = !config.test ? 
                             path.join(this.getProjectFolderPath(), 'images.json') :
                             path.join('tests', 'processing_results', 'images.json');
    
        fs.readFile(imagesDbPath, 'utf8', (err, data) => {
            if (err) callback(err);
            else{
                try{
                    const json = JSON.parse(data);
                    callback(null, json);
                }catch(e){
                    callback(e);
                }
            }
        });
    }

    callWebhooks(){
        // Hooks can be passed via command line 
        // or for each individual task
        const hooks = [this.webhook, config.webhook];

        this.readImagesDatabase((err, images) => {
            if (err) logger.warn(err); // Continue with callback
            if (!images) images = [];

            let json = this.getInfo();
            json.images = images;

            hooks.forEach(hook => {
                if (hook && hook.length > 3){
                    const notifyCallback = (attempt) => {
                        if (attempt > 5){
                            logger.warn(`Webhook invokation failed, will not retry: ${hook}`);
                            return;
                        }
                        request.post(hook, { json },
                            (error, response) => {
                                if (error || response.statusCode != 200){
                                    logger.warn(`Webhook invokation failed, will retry in a bit: ${hook}`);
                                    setTimeout(() => {
                                        notifyCallback(attempt + 1);
                                    }, attempt * 5000);
                                }else{
                                    logger.debug(`Webhook invoked: ${hook}`);
                                }
                        });
                    };
                    notifyCallback(0);
                }
            });
        });
    }

    // Returns the data necessary to serialize this
    // task to restore it later.
    serialize(){
        return {
            uuid: this.uuid,
            name: this.name,
            dateCreated: this.dateCreated,
            status: this.status,
            options: this.options,
            webhook: this.webhook,
            skipPostProcessing: !!this.skipPostProcessing,
            outputs: this.outputs || []
        };
    }
};
