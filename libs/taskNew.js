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
            cb(null, file.originalname);
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

    uploadImages: upload.array("images"),

    handleTaskNew: (res, res) => {
        // TODO: consider doing the file moving in the background
        // and return a response more quickly instead of a long timeout.
        req.setTimeout(1000 * 60 * 20);

        let srcPath = path.join("tmp", req.id);

        // Print error message and cleanup
        const die = (error) => {
            res.json({error});

            // Check if tmp/ directory needs to be cleaned
            if (fs.stat(srcPath, (err, stats) => {
                if (!err && stats.isDirectory()) rmdir(srcPath, () => {}); // ignore errors, don't wait
            }));
        };

        if ((!req.files || req.files.length === 0) && !req.body.zipurl) die("Need at least 1 file or a zip file url.");
        else if (config.maxImages && req.files && req.files.length > config.maxImages) die(`${req.files.length} images uploaded, but this node can only process up to ${config.maxImages}.`);

        else {
            let destPath = path.join(Directories.data, req.id);
            let destImagesPath = path.join(destPath, "images");
            let destGpcPath = path.join(destPath, "gpc");

            async.series([
                cb => {
                    odmInfo.filterOptions(req.body.options, (err, options) => {
                        if (err) cb(err);
                        else {
                            req.body.options = options;
                            cb(null);
                        }
                    });
                },

                // Move all uploads to data/<uuid>/images dir (if any)
                cb => {
                    if (req.files && req.files.length > 0) {
                        fs.stat(destPath, (err, stat) => {
                            if (err && err.code === 'ENOENT') cb();
                            else cb(new Error(`Directory exists (should not have happened: ${err.code})`));
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

                cb => fs.mkdir(destPath, undefined, cb),
                cb => fs.mkdir(destGpcPath, undefined, cb),
                cb => mv(srcPath, destImagesPath, cb),

                cb => {
                    // Find any *.zip file and extract
                    fs.readdir(destImagesPath, (err, entries) => {
                        if (err) cb(err);
                        else {
                            async.eachSeries(entries, (entry, cb) => {
                                if (/\.zip$/gi.test(entry)) {
                                    let filesCount = 0;
                                    fs.createReadStream(path.join(destImagesPath, entry)).pipe(unzip.Parse())
                                            .on('entry', function(entry) {
                                                if (entry.type === 'File') {
                                                    filesCount++;
                                                    entry.pipe(fs.createWriteStream(path.join(destImagesPath, path.basename(entry.path))));
                                                } else {
                                                    entry.autodrain();
                                                }
                                            })
                                            .on('close', () => {
                                                // Verify max images limit
                                                if (config.maxImages && filesCount > config.maxImages) cb(`${filesCount} images uploaded, but this node can only process up to ${config.maxImages}.`);
                                                else cb();
                                            })
                                            .on('error', cb);
                                } else cb();
                            }, cb);
                        }
                    });
                },

                cb => {
                    // Find any *.txt (GPC) file and move it to the data/<uuid>/gpc directory
                    // also remove any lingering zipurl.zip
                    fs.readdir(destImagesPath, (err, entries) => {
                        if (err) cb(err);
                        else {
                            async.eachSeries(entries, (entry, cb) => {
                                if (/\.txt$/gi.test(entry)) {
                                    mv(path.join(destImagesPath, entry), path.join(destGpcPath, entry), cb);
                                }else if (/\.zip$/gi.test(entry)){
                                    fs.unlink(path.join(destImagesPath, entry), cb);
                                } else cb();
                            }, cb);
                        }
                    });
                },

                // Create task
                cb => {
                    new Task(req.id, req.body.name, (err, task) => {
                        if (err) cb(err);
                        else {
                            taskManager.addNew(task);
                            res.json({ uuid: req.id });
                            cb();
                        }
                    }, req.body.options, 
                    req.body.webhook,
                    req.body.skipPostProcessing === 'true');
                }
            ], err => {
                if (err) die(err.message);
            });
        }
    }
}
