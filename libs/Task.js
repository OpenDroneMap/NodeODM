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
const os = require('os');
const assert = require('assert');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const rmdir = require('rimraf');
const odmRunner = require('./odmRunner');
const odmInfo = require('./odmInfo');
const processRunner = require('./processRunner');
const Directories = require('./Directories');
const kill = require('tree-kill');
const S3 = require('./S3');
const request = require('request');
const utils = require('./utils');
const archiver = require('archiver');

const statusCodes = require('./statusCodes');

module.exports = class Task{
    constructor(uuid, name, options = [], webhook = null, skipPostProcessing = false, outputs = [], dateCreated = new Date().getTime(), imagesCountEstimate = -1){
        assert(uuid !== undefined, "uuid must be set");

        this.uuid = uuid;
        this.name = name !== "" ? name : "Task of " + (new Date()).toISOString();
        this.dateCreated = isNaN(parseInt(dateCreated)) ? new Date().getTime() : parseInt(dateCreated);
        this.dateStarted = 0;
        this.processingTime = -1;
        this.setStatus(statusCodes.RUNNING);
        this.options = options;
        this.gcpFiles = [];
        this.geoFiles = [];
        this.imageGroupsFiles = [];
        this.output = [];
        this.runningProcesses = [];
        this.webhook = webhook;
        this.skipPostProcessing = skipPostProcessing;
        this.outputs = utils.parseUnsafePathsList(outputs);
        this.progress = 0;
        this.imagesCountEstimate = imagesCountEstimate;
        this.initialized = false;
        this.onInitialize = []; // Events to trigger on initialization
    }

    initialize(done, additionalSteps = []){
        async.series(additionalSteps.concat(this.setPostProcessingOptsSteps(), [
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
                            if (/^geo\.txt$/gi.test(file)){
                                this.geoFiles.push(file);
                            }else if (/^image_groups\.txt$/gi.test(file)){
                                this.imageGroupsFiles.push(file);
                            }else if (/\.txt$/gi.test(file)){
                                this.gcpFiles.push(file);
                            }
                        });
                        logger.debug(`Found ${this.gcpFiles.length} GCP files (${this.gcpFiles.join(" ")}) for ${this.uuid}`);
                        logger.debug(`Found ${this.geoFiles.length} GEO files (${this.geoFiles.join(" ")}) for ${this.uuid}`);
                        logger.debug(`Found ${this.imageGroupsFiles.length} image groups files (${this.imageGroupsFiles.join(" ")}) for ${this.uuid}`);
                        cb(null);
                    }
                });
            }
        ]), err => {
            // Status might have changed due to user action
            // in which case we leave it unchanged
            if (this.getStatus() === statusCodes.RUNNING){
                if (err) this.setStatus(statusCodes.FAILED, { errorMessage: err.message });
                else this.setStatus(statusCodes.QUEUED);
            }
            this.initialized = true;
            this.onInitialize.forEach(evt => evt(this));
            this.onInitialize = [];
            done(err, this);
        });
    }

    setPostProcessingOptsSteps(){
        return [
            cb => {
                // If we need to post process results
                // if pc-ept is supported (build entwine point cloud)
                // we automatically add the pc-ept option to the task options by default
                if (this.skipPostProcessing) cb();
                else{
                    odmInfo.supportsOption("pc-ept", (err, supported) => {
                        if (err){
                            console.warn(`Cannot check for supported option pc-ept: ${err}`);
                        }else if (supported){
                            if (!this.options.find(opt => opt.name === "pc-ept")){
                                this.options.push({ name: 'pc-ept', value: true });
                            }
                        }
                        cb();
                    });
                }
            },

            cb => {
                // If we need to post process results
                // if cog is supported (build cloud optimized geotiffs)
                // we automatically add the cog option to the task options by default
                if (this.skipPostProcessing) cb();
                else{
                    odmInfo.supportsOption("cog", (err, supported) => {
                        if (err){
                            console.warn(`Cannot check for supported option cog: ${err}`);
                        }else if (supported){
                            if (!this.options.find(opt => opt.name === "cog")){
                                this.options.push({ name: 'cog', value: true });
                            }
                        }
                        cb();
                    });
                }
            }
        ];
    }

    static CreateFromSerialized(taskJson, done){
        const task = new Task(taskJson.uuid, 
            taskJson.name, 
            taskJson.options,
            taskJson.webhook, 
            taskJson.skipPostProcessing,
            taskJson.outputs,
            taskJson.dateCreated);

        task.initialize((err, task) => {
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
        }else{
            return false; // Invalid
        }
        
        return path.join(this.getProjectFolderPath(), filename);
    }

    // Deletes files and folders related to this task
    cleanup(cb){
        if (this.initialized) rmdir(this.getProjectFolderPath(), cb);
        else this.onInitialize.push(() => {
            rmdir(this.getProjectFolderPath(), cb);
        });
    }

    setStatus(code, extra){
        this.status = {
            code: code
        };
        for (let k in extra){
            this.status[k] = extra[k];
        }
    }

    updateProgress(globalProgress){
        globalProgress = Math.min(100, Math.max(0, globalProgress));
        
        // Progress updates are asynchronous (via UDP)
        // so things could be out of order. We ignore all progress
        // updates that are lower than what we might have previously received.
        if (globalProgress >= this.progress){
            this.progress = globalProgress;
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

    isRunning(){
        return this.status.code === statusCodes.RUNNING;
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
            this.updateProgress(100);
            this.stopTrackingProcessingTime();
            done(err);
        };
        
        const postProcess = () => {
            const createZipArchive = (outputFilename, files) => {
                return (done) => {
                    this.output.push(`Compressing ${outputFilename}\n`);

                    const zipFile = path.resolve(this.getAssetsArchivePath(outputFilename));
                    const sourcePath = !config.test ? 
                                        this.getProjectFolderPath() : 
                                        path.join("tests", "processing_results");

                    const pathsToArchive = [];
                    files.forEach(f => {
                        if (fs.existsSync(path.join(sourcePath, f))){
                            pathsToArchive.push(f);
                        }
                    });

                    processRunner.sevenZip({
                        destination: zipFile,
                        pathsToArchive,
                        cwd: sourcePath
                    }, (err, code, _) => {
                        if (err){
                            logger.error(`Could not archive .zip file: ${err.message}`);
                            done(err);
                        }else{
                            if (code === 0){
                                this.updateProgress(97);
                                done();
                            }else done(new Error(`Could not archive .zip file, 7z exited with code ${code}`));
                        }
                    });
                };
            };

            const createZipArchiveLegacy = (outputFilename, files) => {
                return (done) => {
                    this.output.push(`Compressing ${outputFilename}\n`);

                    let output = fs.createWriteStream(this.getAssetsArchivePath(outputFilename));
                    let archive = archiver.create('zip', {
                            zlib: { level: 1 } // Sets the compression level (1 = best speed since most assets are already compressed)
                        });

                    archive.on('finish', () => {
                        this.updateProgress(97);
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
                        }, (err, code, _) => {
                            if (err) done(err);
                            else{
                                if (code === 0){
                                    this.updateProgress(93);
                                    done();
                                }else done(new Error(`Postprocessing failed (${code})`));
                            }
                        }, output => {
                            this.output.push(output);
                        })
                    );
                };
            };

            const saveTaskOutput = (destination) => {
                return (done) => {
                    fs.writeFile(destination, this.output.join("\n"), err => {
                        if (err) logger.info(`Cannot write log at ${destination}, skipping...`);
                        done();
                    });
                };
            }

            // All paths are relative to the project directory (./data/<uuid>/)
            let allPaths = ['odm_orthophoto/odm_orthophoto.tif', 
                              'odm_orthophoto/odm_orthophoto.png',
                              'odm_orthophoto/odm_orthophoto.mbtiles',
                              'odm_orthophoto/odm_orthophoto.kmz',
                              'odm_georeferencing', 'odm_texturing',
                              'odm_dem/dsm.tif', 'odm_dem/dtm.tif', 'dsm_tiles', 'dtm_tiles',
                              'orthophoto_tiles', 'potree_pointcloud', 'entwine_pointcloud', 
                              'images.json', 'cameras.json',
                              'task_output.txt', 'log.json',
                              'odm_report'];
            
            // Did the user request different outputs than the default?
            if (this.outputs.length > 0) allPaths = this.outputs;

            let tasks = [];
            
            if (config.test){
                if (config.testSkipOrthophotos){
                    logger.info("Test mode will skip orthophoto generation");

                    // Exclude these folders from the all.zip archive
                    ['odm_orthophoto/odm_orthophoto.tif', 'odm_orthophoto/odm_orthophoto.mbtiles', 'orthophoto_tiles'].forEach(dir => {
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

                if (config.testSeconds){
                    logger.info(`Test mode will sleep for ${config.testSeconds} seconds before finishing processing`);
                    tasks.push(done => setTimeout(done, config.testSeconds * 1000));
                }

                if (config.testFailTasks){
                    logger.info("Test mode will fail the task");
                    tasks.push(done => done(new Error("Test fail")));
                }

            }
            
            // postprocess.sh is still here for legacy/backward compatibility
            // purposes, but we might remove it in the future. The new logic
            // instructs the processing engine to do the necessary processing
            // of outputs without post processing steps (build EPT).
            // We're leaving it here only for Linux/docker setups, but will not
            // be triggered on Windows.
            if (os.platform() !== "win32" && !this.skipPostProcessing){
                tasks.push(runPostProcessingScript());
            }
            
            const taskOutputFile = path.join(this.getProjectFolderPath(), 'task_output.txt');
            tasks.push(saveTaskOutput(taskOutputFile));

            const archiveFunc = config.has7z ? createZipArchive : createZipArchiveLegacy;
            tasks.push(archiveFunc('all.zip', allPaths));
            
            // Upload to S3 all paths + all.zip file (if config says so)
            if (S3.enabled()){
                tasks.push((done) => {
                    let s3Paths;
                    if (config.s3UploadEverything){
                        s3Paths = ['all.zip'].concat(allPaths);
                    }else{
                        s3Paths = ['all.zip'];
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
            this.dateStarted = new Date().getTime();
            this.setStatus(statusCodes.RUNNING);

            let runnerOptions = this.options.reduce((result, opt) => {
                result[opt.name] = opt.value;
                return result;
            }, {});

            runnerOptions["project-path"] = fs.realpathSync(Directories.data);

            if (this.gcpFiles.length > 0){
                runnerOptions.gcp = fs.realpathSync(path.join(this.getGcpFolderPath(), this.gcpFiles[0]));
            }
            if (this.geoFiles.length > 0){
                runnerOptions.geo = fs.realpathSync(path.join(this.getGcpFolderPath(), this.geoFiles[0]));
            }
            if (this.imageGroupsFiles.length > 0){
                runnerOptions["split-image-groups"] = fs.realpathSync(path.join(this.getGcpFolderPath(), this.imageGroupsFiles[0]));
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
                                let errorMessage = "";
                                switch(code){
                                    case 1:
                                    case 139:
                                    case 134:
                                        errorMessage = `Cannot process dataset`;
                                        break;
                                    case 137:
                                        errorMessage = `Not enough memory`;
                                        break;
                                    case 132:
                                        errorMessage = `Unsupported CPU`;
                                        break;
                                    case 3:
                                        errorMessage = `Installation issue`;
                                        break;
                                    default:
                                        errorMessage = `Processing failed (${code})`;
                                        break;
                                }
                                this.setStatus(statusCodes.FAILED, { errorMessage });
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
    // unless they are being initialized, in which case we switch them back to running
    restart(options, cb){
        if (!this.initialized && this.status.code === statusCodes.CANCELED){
            this.setStatus(statusCodes.RUNNING);
            if (options !== undefined){
                this.options = options;
                async.series(this.setPostProcessingOptsSteps(), cb);
            }else{
                cb();
            }
        }else if ([statusCodes.CANCELED, statusCodes.FAILED, statusCodes.COMPLETED].indexOf(this.status.code) !== -1){
            this.setStatus(statusCodes.QUEUED);
            this.dateCreated = new Date().getTime();
            this.dateStarted = 0;
            this.output = [];
            this.progress = 0;
            this.stopTrackingProcessingTime(true);
            if (options !== undefined){
                this.options = options;
                async.series(this.setPostProcessingOptsSteps(), cb);
            }else{
                cb();
            }
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
            imagesCount: this.images !== undefined ? this.images.length : this.imagesCountEstimate,
            progress: this.progress
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
            dateStarted: this.dateStarted,
            status: this.status,
            options: this.options,
            webhook: this.webhook,
            skipPostProcessing: !!this.skipPostProcessing,
            outputs: this.outputs || []
        };
    }
};
