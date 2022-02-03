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

const multer = require('multer');
const fs = require('fs');
const path = require('path');
const TaskManager = require('./TaskManager');
const uuidv4 = require('uuid/v4');
const config = require('../config.js');
const rmdir = require('rimraf');
const Directories = require('./Directories');
const mv = require('mv');
const Task = require('./Task');
const async = require('async');
const odmInfo = require('./odmInfo');
const request = require('request');
const ziputils = require('./ziputils');
const statusCodes = require('./statusCodes');

const download = function(uri, filename, callback) {
    request.head(uri, function(err, res, body) {
        if (err) callback(err);
        else{
            request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
        }
    });
};

const removeDirectory = function(dir, cb = () => {}){
    fs.stat(dir, (err, stats) => {
        if (!err && stats.isDirectory()) rmdir(dir, cb); // ignore errors, don't wait
        else cb(err);
    });
};

const assureUniqueFilename = (dstPath, filename, cb) => {
    const dstFile = path.join(dstPath, filename);
    fs.exists(dstFile, exists => {
        if (!exists) cb(null, filename);
        else{
            const parts = filename.split(".");
            if (parts.length > 1){
                assureUniqueFilename(dstPath, 
                    `${parts.slice(0, parts.length - 1).join(".")}_.${parts[parts.length - 1]}`, 
                    cb);
            }else{
                // Filename without extension? Strange..
                assureUniqueFilename(dstPath, filename + "_", cb);
            }
        }
    });
};

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            let dstPath = path.join("tmp", req.id);
            fs.exists(dstPath, exists => {
                if (!exists) {
                    fs.mkdir(dstPath, undefined, () => {
                        cb(null, dstPath);
                    });
                } else {
                    cb(null, dstPath);
                }
            });
        },
        filename: (req, file, cb) => {
            let filename = file.originalname;
            if (filename === "body.json") filename = "_body.json";

            let dstPath = path.join("tmp", req.id);
            assureUniqueFilename(dstPath, filename, cb);
        }
    })
});

module.exports = {
    assignUUID: (req, res, next) => {
        // A user can optionally suggest a UUID instead of letting
        // nodeODM pick one.
        if (req.get('set-uuid')){
            const userUuid = req.get('set-uuid');
    
            // Valid UUID and no other task with same UUID?
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userUuid) && !TaskManager.singleton().find(userUuid)){
                req.id = userUuid;
                next();
            }else{
                res.json({error: `Invalid set-uuid: ${userUuid}`})
            }
        }else{
            req.id = uuidv4();
            next();
        }
    },

    getUUID: (req, res, next) => {
        req.id = req.params.uuid;
        if (!req.id) res.json({error: `Invalid uuid (not set)`});

        const srcPath = path.join("tmp", req.id);
        const bodyFile = path.join(srcPath, "body.json");

        fs.access(bodyFile, fs.F_OK, err => {
            if (err) res.json({error: `Invalid uuid (not found)`});
            else next();
        });
    },

    preUpload: (req, res, next) => {
        // Testing stuff
        if (!config.test) next();
        else{
            if (config.testDropUploads){
                if (Math.random() < 0.5) res.sendStatus(500);
                else next();
            }else{
                next();
            }
        }
    },

    uploadImages: upload.array("images"),

    handleUpload: (req, res) => {
        // IMPROVEMENT: check files count limits ahead of handleTaskNew
        if (req.files && req.files.length > 0){
            res.json({success: true});
        }else{
            res.json({error: "Need at least 1 file.", noRetry: true});
        }
    },

    handleCommit: (req, res, next) => {
        const srcPath = path.join("tmp", req.id);
        const bodyFile = path.join(srcPath, "body.json");

        async.series([
            cb => {
                fs.readFile(bodyFile, 'utf8', (err, data) => {
                    if (err) cb(err);
                    else{
                        try{
                            const body = JSON.parse(data);
                            fs.unlink(bodyFile, err => {
                                if (err) cb(err);
                                else cb(null, body);
                            });
                        }catch(e){
                            cb(new Error("Malformed body.json"));
                        }
                    }
                });
            },
            cb => fs.readdir(srcPath, cb),
        ], (err, [ body, files ]) => {
            if (err) res.json({error: err.message});
            else{
                req.body = body;
                req.files = files;

                if (req.files.length === 0){
                    req.error = "Need at least 1 file.";
                }
                next();
            }
        });
    },

    handleInit: (req, res) => {
        req.body = req.body || {};
        
        const srcPath = path.join("tmp", req.id);
        const bodyFile = path.join(srcPath, "body.json");

        // Print error message and cleanup
        const die = (error) => {
            res.json({error});
            removeDirectory(srcPath);
        };

        async.series([
            cb => {
                // Check for problems before file uploads
                if (req.body && req.body.options){
                    odmInfo.filterOptions(req.body.options, err => {
                        if (err) cb(err);
                        else cb();
                    });
                }else cb();
            },
            cb => {
                fs.stat(srcPath, (err, stat) => {
                    if (err && err.code === 'ENOENT') fs.mkdir(srcPath, undefined, cb);
                    else cb(); // Dir already exists
                });
            },
            cb => {
                fs.writeFile(bodyFile, JSON.stringify(req.body), {encoding: 'utf8'}, cb);
            },
            cb => {
                res.json({uuid: req.id});
                cb();
            }
        ],  err => {
            if (err) die(err.message);
        });
    },

    createTask: (req, res) => {
        const srcPath = path.join("tmp", req.id);

        // Print error message and cleanup
        const die = (error) => {
            res.json({error});
            removeDirectory(srcPath);
        };
        
        let destPath = path.join(Directories.data, req.id);
        let destImagesPath = path.join(destPath, "images");
        let destGcpPath = path.join(destPath, "gcp");

        const checkMaxImageLimits = (cb) => {
            if (!config.maxImages) cb();
            else{
                fs.readdir(destImagesPath, (err, files) => {
                    if (err) cb(err);
                    else if (files.length > config.maxImages) cb(new Error(`${files.length} images uploaded, but this node can only process up to ${config.maxImages}.`));
                    else cb();
                });
            }
        };

        let initSteps = [
            // Check if dest directory already exists
            cb => {
                if (req.files && req.files.length > 0) {
                    fs.stat(destPath, (err, stat) => {
                        if (err && err.code === 'ENOENT') cb();
                        else{
                            // Directory already exists, this could happen
                            // if a previous attempt at upload failed and the user
                            // used set-uuid to specify the same UUID over the previous run
                            // Try to remove it
                            removeDirectory(destPath, err => {
                                if (err) cb(new Error(`Directory exists and we couldn't remove it.`));
                                else cb();
                            });
                        } 
                    });
                } else {
                    cb();
                }
            },

            // Unzips zip URL to tmp/<uuid>/ (if any)
            cb => {
                if (req.body.zipurl) {
                    let archive = "zipurl.zip";

                    upload.storage.getDestination(req, archive, (err, dstPath) => {
                        if (err) cb(err);
                        else{
                            let archiveDestPath = path.join(dstPath, archive);

                            download(req.body.zipurl, archiveDestPath, cb);
                        }
                    });
                } else {
                    cb();
                }
            },
            
            // Move all uploads to data/<uuid>/images dir (if any)
            cb => fs.mkdir(destPath, undefined, cb),
            cb => fs.mkdir(destGcpPath, undefined, cb),
            cb => {
                // We attempt to do this multiple times,
                // as antivirus software sometimes is scanning
                // the folder while we try to move it, resulting in
                // an operation not permitted error
                let retries = 0;

                const move = () => {
                    mv(srcPath, destImagesPath, err => {
                        if (!err) cb(); // Done
                        else{
                            if (++retries < 20){
                                logger.warn(`Cannot move ${srcPath}, probably caused by antivirus software (please disable it or add an exception), retrying (${retries})...`);
                                setTimeout(2000, move);
                            }else cb(err);
                        }
                    });
                }
                move();
            },
            // Zip files handling
            cb => {
                const handleSeed = (cb) => {
                    const seedFileDst = path.join(destPath, "seed.zip");

                    async.series([
                        // Move to project root
                        cb => mv(path.join(destImagesPath, "seed.zip"), seedFileDst, cb),
                        
                        // Extract
                        cb => {
                            ziputils.unzip(seedFileDst, destPath, cb);
                        },

                        // Remove
                        cb => {
                            fs.exists(seedFileDst, exists => {
                                if (exists) fs.unlink(seedFileDst, cb);
                                else cb();
                            });
                        }
                    ], cb);
                }

                const handleZipUrl = (cb) => {
                    // Extract images
                    ziputils.unzip(path.join(destImagesPath, "zipurl.zip"), 
                                    destImagesPath, 
                                    cb, true);
                }

                // Find and handle zip files and extract
                fs.readdir(destImagesPath, (err, entries) => {
                    if (err) cb(err);
                    else {
                        async.eachSeries(entries, (entry, cb) => {
                            if (entry === "seed.zip"){
                                handleSeed(cb);
                            }else if (entry === "zipurl.zip") {
                                handleZipUrl(cb);
                            } else cb();
                        }, cb);
                    }
                });
            },

            // Verify max images limit
            cb => {
                checkMaxImageLimits(cb);
            },

            cb => {
                // Find any *.txt (GCP) file and move it to the data/<uuid>/gcp directory
                // also remove any lingering zipurl.zip
                fs.readdir(destImagesPath, (err, entries) => {
                    if (err) cb(err);
                    else {
                        async.eachSeries(entries, (entry, cb) => {
                            if (/\.txt$/gi.test(entry)) {
                                mv(path.join(destImagesPath, entry), path.join(destGcpPath, entry), cb);
                            }else if (/\.zip$/gi.test(entry)){
                                fs.unlink(path.join(destImagesPath, entry), cb);
                            } else cb();
                        }, cb);
                    }
                });
            }
        ];

        if (req.error !== undefined){
            die(req.error);
        }else{
            let imagesCountEstimate = -1;

            async.series([
                cb => {
                    // Basic path check
                    fs.exists(srcPath, exists => {
                        if (exists) cb();
                        else cb(new Error(`Invalid UUID`));
                    });
                },
                cb => {
                    odmInfo.filterOptions(req.body.options, (err, options) => {
                        if (err) cb(err);
                        else {
                            req.body.options = options;
                            cb(null);
                        }
                    });
                },
                cb => {
                    fs.readdir(srcPath, (err, entries) => {
                        if (!err) imagesCountEstimate = entries.length;
                        cb();
                    });
                },
                cb => {
                    const task = new Task(req.id, req.body.name, req.body.options,
                            req.body.webhook,
                            req.body.skipPostProcessing === 'true',
                            req.body.outputs,
                            req.body.dateCreated,
                            imagesCountEstimate
                        );
                    TaskManager.singleton().addNew(task);
                    res.json({ uuid: req.id });
                    cb();

                    // We return a UUID right away but continue
                    // doing processing in the background

                    task.initialize(err => {
                        if (err) {
                            // Cleanup
                            removeDirectory(srcPath);
                            removeDirectory(destPath);
                        } else TaskManager.singleton().processNextTask();
                    }, initSteps);
                }
            ], err => {
                if (err) die(err.message);
            });
        }
    }
}
