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

let fs = require('fs');
let config = require('./config.js');
let packageJson = JSON.parse(fs.readFileSync('./package.json'));

let logger = require('./libs/logger');
let path = require('path');
let async = require('async');
let mime = require('mime');

let express = require('express');
let app = express();

let addRequestId = require('./libs/expressRequestId')();
let multer = require('multer');
let bodyParser = require('body-parser');
let morgan = require('morgan');

let TaskManager = require('./libs/TaskManager');
let Task = require('./libs/Task');
let odmOptions = require('./libs/odmOptions');
let Directories = require('./libs/Directories');
let unzip = require('node-unzip-2');

// zip files
let request = require('request');

let download = function(uri, filename, callback) {
    request.head(uri, function(err, res, body) {
        if (err) callback(err);
        else{
            request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
        }
    });
};


let winstonStream = {
    write: function(message, encoding) {
        logger.debug(message.slice(0, -1));
    }
};
app.use(morgan('combined', { stream: winstonStream }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/swagger.json', express.static('docs/swagger.json'));

let upload = multer({
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

let taskManager;
let server;

/** @swagger
 *  /task/new:
 *    post:
 *      description: Creates a new task and places it at the end of the processing queue
 *      tags: [task]
 *      consumes:
 *        - multipart/form-data
 *      parameters:
 *        -
 *          name: images
 *          in: formData
 *          description: Images to process, plus an optional GPC file. If included, the GPC file should have .txt extension
 *          required: false
 *          type: file
 *        -
 *          name: zipurl
 *          in: formData
 *          description: URL of the zip file containing the images to process, plus an optional GPC file. If included, the GPC file should have .txt extension
 *          required: false
 *          type: string
 *        - 
 *          name: name
 *          in: formData
 *          description: An optional name to be associated with the task
 *          required: false
 *          type: string
 *        - 
 *          name: options
 *          in: formData
 *          description: 'Serialized JSON string of the options to use for processing, as an array of the format: [{name: option1, value: value1}, {name: option2, value: value2}, ...]. For example, [{"name":"cmvs-maxImages","value":"500"},{"name":"time","value":true}]. For a list of all options, call /options'
 *          required: false
 *          type: string
 *      responses:
 *        200:
 *          description: Success
 *          schema:
 *            type: object
 *            required: [uuid]
 *            properties:
 *              uuid:
 *                type: string
 *                description: UUID of the newly created task
 *        default:
 *          description: Error
 *          schema:
 *            $ref: '#/definitions/Error'
 */
app.post('/task/new', addRequestId, upload.array('images'), (req, res) => {

    if ((!req.files || req.files.length === 0) && !req.body.zipurl) res.json({ error: "Need at least 1 file or a zip file url." });

    else {
        let srcPath = path.join("tmp", req.id);
        let destPath = path.join(Directories.data, req.id);
        let destImagesPath = path.join(destPath, "images");
        let destGpcPath = path.join(destPath, "gpc");

        async.series([
            cb => {
                odmOptions.filterOptions(req.body.options, (err, options) => {
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
            cb => fs.rename(srcPath, destImagesPath, cb),
            

            cb => {
                // Find any *.zip file and extract
                fs.readdir(destImagesPath, (err, entries) => {
                    if (err) cb(err);
                    else {
                        async.eachSeries(entries, (entry, cb) => {
                            if (/\.zip$/gi.test(entry)) {
                                fs.createReadStream(path.join(destImagesPath, entry)).pipe(unzip.Parse())
                                        .on('entry', function(entry) {
                                            if (entry.type === 'File') {
                                                entry.pipe(fs.createWriteStream(path.join(destImagesPath, path.basename(entry.path))));
                                            } else {
                                                entry.autodrain();
                                            }
                                        })
                                        .on('close', cb)
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
                                fs.rename(path.join(destImagesPath, entry), path.join(destGpcPath, entry), cb);
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
                }, req.body.options, req.body.webhook);
            }
        ], err => {
            if (err) res.json({ error: err.message });
        });
    }

});

let getTaskFromUuid = (req, res, next) => {
    let task = taskManager.find(req.params.uuid);
    if (task) {
        req.task = task;
        next();
    } else res.json({ error: `${req.params.uuid} not found` });
};

/** @swagger
 *  /task/{uuid}/info:
 *     get:
 *       description: Gets information about this task, such as name, creation date, processing time, status, command line options and number of images being processed. See schema definition for a full list.
 *       tags: [task]
 *       parameters:
 *        -
 *           name: uuid
 *           in: path
 *           description: UUID of the task
 *           required: true
 *           type: string
 *       responses:
 *        200:
 *         description: Task Information
 *         schema:
 *           title: TaskInfo
 *           type: object
 *           required: [uuid, name, dateCreated, processingTime, status, options, imagesCount]
 *           properties:
 *            uuid:
 *              type: string
 *              description: UUID
 *            name:
 *              type: string
 *              description: Name
 *            dateCreated:
 *              type: integer
 *              description: Timestamp
 *            processingTime:
 *              type: integer
 *              description: Milliseconds that have elapsed since the task started being processed.
 *            status:
 *              type: integer
 *              description: Status code (10 = QUEUED, 20 = RUNNING, 30 = FAILED, 40 = COMPLETED, 50 = CANCELED)
 *              enum: [10, 20, 30, 40, 50]
 *            options:
 *              type: array
 *              description: List of options used to process this task
 *              items:
 *                type: object
 *                required: [name, value]
 *                properties:
 *                  name:
 *                    type: string
 *                    description: 'Option name (example: "odm_meshing-octreeDepth")'
 *                  value:
 *                    type: string
 *                    description: 'Value (example: 9)'
 *            imagesCount:
 *              type: integer
 *              description: Number of images
 *        default:
 *          description: Error
 *          schema:
 *            $ref: '#/definitions/Error'
 */
app.get('/task/:uuid/info', getTaskFromUuid, (req, res) => {
    res.json(req.task.getInfo());
});

/** @swagger
 *  /task/{uuid}/output:
 *     get:
 *       description: Retrieves the console output of the OpenDroneMap's process. Useful for monitoring execution and to provide updates to the user.
 *       tags: [task]
 *       parameters:
 *        -
 *           name: uuid
 *           in: path
 *           description: UUID of the task
 *           required: true
 *           type: string
 *        -
 *         name: line
 *         in: query
 *         description: Optional line number that the console output should be truncated from. For example, passing a value of 100 will retrieve the console output starting from line 100. Defaults to 0 (retrieve all console output).
 *         default: 0
 *         required: false
 *         type: integer
 *       responses:
 *        200:
 *         description: Console Output
 *         schema:
 *           type: string
 *        default:
 *          description: Error
 *          schema:
 *            $ref: '#/definitions/Error'
 */
app.get('/task/:uuid/output', getTaskFromUuid, (req, res) => {
    res.json(req.task.getOutput(req.query.line));
});

/** @swagger
 *  /task/{uuid}/download/{asset}:
 *    get:
 *      description: Retrieves an asset (the output of OpenDroneMap's processing) associated with a task
 *      tags: [task]
 *      produces: [application/zip]
 *      parameters:
 *        - name: uuid
 *          in: path
 *          type: string
 *          description: UUID of the task
 *          required: true
 *        - name: asset
 *          in: path
 *          type: string
 *          description: Type of asset to download. Use "all.zip" for zip file containing all assets.
 *          required: true
 *          enum:
 *            - all.zip
 *            - orthophoto.tif
 *      responses:
 *        200:
 *          description: Asset File
 *          schema:
 *            type: file
 *        default:
 *          description: Error message
 *          schema:
 *            $ref: '#/definitions/Error'
 */
app.get('/task/:uuid/download/:asset', getTaskFromUuid, (req, res) => {
    let asset = req.params.asset !== undefined ? req.params.asset : "all.zip";
    let filePath = req.task.getAssetsArchivePath(asset);
    if (filePath) {
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Disposition', `attachment; filename=${asset}`);
            res.setHeader('Content-Type', mime.lookup(filePath));
            res.setHeader('Content-Length', fs.statSync(filePath).size);

            const filestream = fs.createReadStream(filePath);
            filestream.pipe(res);
        } else {
            res.json({ error: "Asset not ready" });
        }
    } else {
        res.json({ error: "Invalid asset" });
    }
});

/** @swagger
 * definition:
 *   Error:
 *     type: object
 *     required:
 *       - error
 *     properties:
 *       error:
 *         type: string
 *         description: Description of the error
 *   Response:
 *     type: object
 *     required:
 *       - success
 *     properties:
 *       success:
 *         type: boolean
 *         description: true if the command succeeded, false otherwise
 *       error:
 *         type: string
 *         description: Error message if an error occured
 */
let uuidCheck = (req, res, next) => {
    if (!req.body.uuid) res.json({ error: "uuid param missing." });
    else next();
};

let successHandler = res => {
    return err => {
        if (!err) res.json({ success: true });
        else res.json({ success: false, error: err.message });
    };
};

/** @swagger
 * /task/cancel:
 *    post:
 *      description: Cancels a task (stops its execution, or prevents it from being executed)
 *      parameters:
 *        -
 *          name: uuid
 *          in: body
 *          description: UUID of the task
 *          required: true
 *          schema:
 *            type: string
 *      responses:
 *        200:
 *          description: Command Received
 *          schema:
 *            $ref: "#/definitions/Response"
 */
app.post('/task/cancel', uuidCheck, (req, res) => {
    taskManager.cancel(req.body.uuid, successHandler(res));
});

/** @swagger
 * /task/remove:
 *    post:
 *      description: Removes a task and deletes all of its assets
 *      parameters:
 *        -
 *          name: uuid
 *          in: body
 *          description: UUID of the task
 *          required: true
 *          schema:
 *            type: string
 *      responses:
 *        200:
 *          description: Command Received
 *          schema:
 *            $ref: "#/definitions/Response"
 */
app.post('/task/remove', uuidCheck, (req, res) => {
    taskManager.remove(req.body.uuid, successHandler(res));
});

/** @swagger
 * /task/restart:
 *    post:
 *      description: Restarts a task that was previously canceled, that had failed to process or that successfully completed
 *      parameters:
 *        -
 *          name: uuid
 *          in: body
 *          description: UUID of the task
 *          required: true
 *          schema:
 *            type: string
 *        -
 *          name: options
 *          in: body
 *          description: 'Serialized JSON string of the options to use for processing, as an array of the format: [{name: option1, value: value1}, {name: option2, value: value2}, ...]. For example, [{"name":"cmvs-maxImages","value":"500"},{"name":"time","value":true}]. For a list of all options, call /options. Overrides the previous options set for this task.'
 *          required: false
 *          schema:
 *            type: string
 *      responses:
 *        200:
 *          description: Command Received
 *          schema:
 *            $ref: "#/definitions/Response"
 */
app.post('/task/restart', uuidCheck, (req, res, next) => {
    if (req.body.options){
        odmOptions.filterOptions(req.body.options, (err, options) => {
            if (err) res.json({ error: err.message });
            else {
                req.body.options = options;
                next();
            }
        });
    } else next();
}, (req, res) => {
    taskManager.restart(req.body.uuid, req.body.options, successHandler(res));
});

/** @swagger
 * /options:
 *   get:
 *     description: Retrieves the command line options that can be passed to process a task
 *     tags: [server]
 *     responses:
 *       200:
 *         description: Options
 *         schema:
 *           type: array
 *           items:
 *             title: Option
 *             type: object
 *             required: [name, type, value, domain, help]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Command line option (exactly as it is passed to the OpenDroneMap process, minus the leading '--')
 *               type:
 *                 type: string
 *                 description: Datatype of the value of this option
 *                 enum:
 *                   - int
 *                   - float
 *                   - string
 *                   - bool
 *               value:
 *                 type: string
 *                 description: Default value of this option
 *               domain:
 *                 type: string
 *                 description: Valid range of values (for example, "positive integer" or "float > 0.0")
 *               help:
 *                 type: string
 *                 description: Description of what this option does
 */
app.get('/options', (req, res) => {
    odmOptions.getOptions((err, options) => {
        if (err) res.json({ error: err.message });
        else res.json(options);
    });
});

/** @swagger
 * /info:
 *   get:
 *     description: Retrieves information about this node
 *     tags: [server]
 *     responses:
 *       200:
 *         description: Info
 *         schema:
 *           type: object
 *           required: [version, taskQueueCount]
 *           properties:
 *             version:
 *               type: string
 *               description: Current version
 *             taskQueueCount:
 *               type: integer
 *               description: Number of tasks currently being processed or waiting to be processed
 */
app.get('/info', (req, res) => {
    res.json({
        version: packageJson.version,
        taskQueueCount: taskManager.getQueueCount()
    });
});

let gracefulShutdown = done => {
    async.series([
        cb => taskManager.dumpTaskList(cb),
        cb => {
            logger.info("Closing server");
            server.close();
            logger.info("Exiting...");
            process.exit(0);
        }
    ], done);
};

// listen for TERM signal .e.g. kill
process.on('SIGTERM', gracefulShutdown);

// listen for INT signal e.g. Ctrl-C
process.on('SIGINT', gracefulShutdown);

// Startup
if (config.test) logger.info("Running in test mode");

let commands = [
    cb => odmOptions.initialize(cb),
    cb => { taskManager = new TaskManager(cb); },
    cb => {
        server = app.listen(config.port, err => {
            if (!err) logger.info('Server has started on port ' + String(config.port));
            cb(err);
        });
    }
];

if (config.powercycle) {
    commands.push(cb => {
        logger.info("Power cycling is set, application will shut down...");
        process.exit(0);
    });
}

async.series(commands, err => {
    if (err) {
        logger.error("Error during startup: " + err.message);
        process.exit(1);
    }
});
