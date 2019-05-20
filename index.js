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

const fs = require('fs');
const config = require('./config.js');
const packageJson = JSON.parse(fs.readFileSync('./package.json'));

const logger = require('./libs/logger');
const async = require('async');
const mime = require('mime');

const express = require('express');
const app = express();

const bodyParser = require('body-parser');
const multer = require('multer');

const TaskManager = require('./libs/TaskManager');
const odmInfo = require('./libs/odmInfo');
const si = require('systeminformation');
const S3 = require('./libs/S3');

const auth = require('./libs/auth/factory').fromConfig(config);
const authCheck = auth.getMiddleware();
const taskNew = require('./libs/taskNew');

app.use(express.static('public'));
app.use('/swagger.json', express.static('docs/swagger.json'));

const formDataParser = multer().none();
const urlEncodedBodyParser = bodyParser.urlencoded({extended: false});

let taskManager;
let server;

/** @swagger
 *  /task/new/init:
 *    post:
 *      description: Initialize the upload of a new task. If successful, a user can start uploading files via /task/new/upload. The task will not start until /task/new/commit is called.
 *      tags: [task]
 *      parameters:
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
 *        -
 *          name: skipPostProcessing
 *          in: formData
 *          description: 'When set, skips generation of map tiles, derivate assets, point cloud tiles.'
 *          required: false
 *          type: boolean
 *        -
 *          name: webhook
 *          in: formData
 *          description: Optional URL to call when processing has ended (either successfully or unsuccessfully).
 *          required: false
 *          type: string
 *        -
 *          name: outputs
 *          in: formData
 *          description: 'An optional serialized JSON string of paths relative to the project directory that should be included in the all.zip result file, overriding the default behavior.'
 *          required: false
 *          type: string
 *        -
 *          name: token
 *          in: query
 *          description: 'Token required for authentication (when authentication is required).'
 *          required: false
 *          type: string
 *        -
 *          name: set-uuid
 *          in: header
 *          description: 'An optional UUID string that will be used as UUID for this task instead of generating a random one.'
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
app.post('/task/new/init', authCheck, taskNew.assignUUID, formDataParser, taskNew.handleInit);

/** @swagger
 *  /task/new/upload/{uuid}:
 *    post:
 *      description: Adds one or more files to the task created via /task/new/init. It does not start the task. To start the task, call /task/new/commit.
 *      tags: [task]
 *      consumes:
 *        - multipart/form-data
 *      parameters:
 *        -
 *           name: uuid
 *           in: path
 *           description: UUID of the task
 *           required: true
 *           type: string
 *        -
 *          name: images
 *          in: formData
 *          description: Images to process, plus an optional GCP file (*.txt) and/or an optional seed file (seed.zip). If included, the GCP file should have .txt extension. If included, the seed archive pre-polulates the task directory with its contents.
 *          required: true
 *          type: file
 *        -
 *          name: token
 *          in: query
 *          description: 'Token required for authentication (when authentication is required).'
 *          required: false
 *          type: string
 *      responses:
 *        200:
 *          description: File Received
 *          schema:
 *            $ref: "#/definitions/Response"
 *        default:
 *          description: Error
 *          schema:
 *            $ref: '#/definitions/Error'
 */
app.post('/task/new/upload/:uuid', authCheck, taskNew.getUUID, taskNew.preUpload, taskNew.uploadImages, taskNew.handleUpload);

/** @swagger
 *  /task/new/commit/{uuid}:
 *    post:
 *      description: Creates a new task for which images have been uploaded via /task/new/upload.
 *      tags: [task]
 *      parameters:
 *        -
 *           name: uuid
 *           in: path
 *           description: UUID of the task
 *           required: true
 *           type: string
 *        -
 *          name: token
 *          in: query
 *          description: 'Token required for authentication (when authentication is required).'
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
app.post('/task/new/commit/:uuid', authCheck, taskNew.getUUID, taskNew.handleCommit, taskNew.createTask);

/** @swagger
 *  /task/new:
 *    post:
 *      description: Creates a new task and places it at the end of the processing queue. For uploading really large tasks, see /task/new/init instead.
 *      tags: [task]
 *      consumes:
 *        - multipart/form-data
 *      parameters:
 *        -
 *          name: images
 *          in: formData
 *          description: Images to process, plus an optional GCP file (*.txt) and/or an optional seed file (seed.zip). If included, the GCP file should have .txt extension. If included, the seed archive pre-polulates the task directory with its contents.
 *          required: false
 *          type: file
 *        -
 *          name: zipurl
 *          in: formData
 *          description: URL of the zip file containing the images to process, plus an optional GCP file. If included, the GCP file should have .txt extension
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
 *        -
 *          name: skipPostProcessing
 *          in: formData
 *          description: 'When set, skips generation of map tiles, derivate assets, point cloud tiles.'
 *          required: false
 *          type: boolean
 *        -
 *          name: webhook
 *          in: formData
 *          description: Optional URL to call when processing has ended (either successfully or unsuccessfully).
 *          required: false
 *          type: string
 *        -
 *          name: outputs
 *          in: formData
 *          description: 'An optional serialized JSON string of paths relative to the project directory that should be included in the all.zip result file, overriding the default behavior.'
 *          required: false
 *          type: string
 *        -
 *          name: token
 *          in: query
 *          description: 'Token required for authentication (when authentication is required).'
 *          required: false
 *          type: string
 *        -
 *          name: set-uuid
 *          in: header
 *          description: 'An optional UUID string that will be used as UUID for this task instead of generating a random one.'
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
app.post('/task/new', authCheck, taskNew.assignUUID, taskNew.uploadImages, (req, res, next) => {
    req.body = req.body || {};
    if ((!req.files || req.files.length === 0) && !req.body.zipurl) req.error = "Need at least 1 file or a zip file url.";
    else if (config.maxImages && req.files && req.files.length > config.maxImages) req.error = `${req.files.length} images uploaded, but this node can only process up to ${config.maxImages}.`;
    next();
}, taskNew.createTask);

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
 *        -
 *          name: options
 *          in: formData
 *          description: 'Serialized JSON string of the options to use for processing, as an array of the format: [{name: option1, value: value1}, {name: option2, value: value2}, ...]. For example, [{"name":"cmvs-maxImages","value":"500"},{"name":"time","value":true}]. For a list of all options, call /options'
 *          required: false
 *          type: string
 *        -
 *          name: token
 *          in: query
 *          description: 'Token required for authentication (when authentication is required).'
 *          required: false
 *          type: string
 *        -
 *          name: with_output
 *          in: query
 *          description: Optionally retrieve the console output for this task. The parameter specifies the line number that the console output should be truncated from. For example, passing a value of 100 will retrieve the console output starting from line 100. By default no console output is added to the response.
 *          default: 0
 *          required: false
 *          type: integer
 *       responses:
 *        200:
 *         description: Task Information
 *         schema:
 *           title: TaskInfo
 *           type: object
 *           required: [uuid, name, dateCreated, processingTime, status, options, imagesCount, progress]
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
 *              type: object
 *              required: [code]
 *              properties:
 *                code:
 *                  type: integer
 *                  description: Status code (10 = QUEUED, 20 = RUNNING, 30 = FAILED, 40 = COMPLETED, 50 = CANCELED)
 *                  enum: [10, 20, 30, 40, 50]
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
 *            progress:
 *              type: float
 *              description: Percentage progress (estimated) of the task
 *            output:
 *              type: array
 *              description: Console output for the task (only if requested via ?output=<linenum>)
 *              items:
 *                type: string
 *        default:
 *          description: Error
 *          schema:
 *            $ref: '#/definitions/Error'
 */
app.get('/task/:uuid/info', authCheck, getTaskFromUuid, (req, res) => {
    const info = req.task.getInfo();
    if (req.query.with_output !== undefined) info.output = req.task.getOutput(req.query.with_output);
    res.json(info);
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
 *        -
 *          name: token
 *          in: query
 *          description: 'Token required for authentication (when authentication is required).'
 *          required: false
 *          type: string
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
app.get('/task/:uuid/output', authCheck, getTaskFromUuid, (req, res) => {
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
 *        -
 *          name: token
 *          in: query
 *          description: 'Token required for authentication (when authentication is required).'
 *          required: false
 *          type: string
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
app.get('/task/:uuid/download/:asset', authCheck, getTaskFromUuid, (req, res) => {
    let asset = req.params.asset !== undefined ? req.params.asset : "all.zip";
    let filePath = req.task.getAssetsArchivePath(asset);
    if (filePath) {
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Disposition', `attachment; filename=${asset}`);
            res.setHeader('Content-Type', mime.getType(filePath));
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
 *        -
 *          name: token
 *          in: query
 *          description: 'Token required for authentication (when authentication is required).'
 *          required: false
 *          type: string
 *      responses:
 *        200:
 *          description: Command Received
 *          schema:
 *            $ref: "#/definitions/Response"
 */
app.post('/task/cancel', urlEncodedBodyParser, authCheck, uuidCheck, (req, res) => {
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
 *        -
 *          name: token
 *          in: query
 *          description: 'Token required for authentication (when authentication is required).'
 *          required: false
 *          type: string
 *      responses:
 *        200:
 *          description: Command Received
 *          schema:
 *            $ref: "#/definitions/Response"
 */
app.post('/task/remove', urlEncodedBodyParser, authCheck, uuidCheck, (req, res) => {
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
 *        -
 *          name: token
 *          in: query
 *          description: 'Token required for authentication (when authentication is required).'
 *          required: false
 *          type: string
 *      responses:
 *        200:
 *          description: Command Received
 *          schema:
 *            $ref: "#/definitions/Response"
 */
app.post('/task/restart', urlEncodedBodyParser, authCheck, uuidCheck, (req, res, next) => {
    if (req.body.options){
        odmInfo.filterOptions(req.body.options, (err, options) => {
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
 *     parameters:
 *       -
 *         name: token
 *         in: query
 *         description: 'Token required for authentication (when authentication is required).'
 *         required: false
 *         type: string
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
app.get('/options', authCheck, (req, res) => {
    odmInfo.getOptions((err, options) => {
        if (err) res.json({ error: err.message });
        else res.json(options);
    });
});

/** @swagger
 * /info:
 *   get:
 *     description: Retrieves information about this node
 *     parameters:
 *       -
 *         name: token
 *         in: query
 *         description: 'Token required for authentication (when authentication is required).'
 *         required: false
 *         type: string
 *     tags: [server]
 *     responses:
 *       200:
 *         description: Info
 *         schema:
 *           type: object
 *           required: [version, taskQueueCount, maxImages, engineVersion, engine]
 *           properties:
 *             version:
 *               type: string
 *               description: Current API version
 *             taskQueueCount:
 *               type: integer
 *               description: Number of tasks currently being processed or waiting to be processed
 *             availableMemory:
 *               type: integer
 *               description: Amount of RAM available in bytes
 *             totalMemory:
 *               type: integer
 *               description: Amount of total RAM in the system in bytes
 *             cpuCores:
 *               type: integer
 *               description: Number of CPU cores (virtual)
 *             maxImages:
 *               type: integer
 *               description: Maximum number of images allowed for new tasks or null if there's no limit.
 *             maxParallelTasks:
 *               type: integer
 *               description: Maximum number of tasks that can be processed simultaneously
 *             engineVersion:
 *               type: string
 *               description: Current version of processing engine
 *             engine:
 *               type: string
 *               description: Lowercase identifier of processing engine
 */
app.get('/info', authCheck, (req, res) => {
    async.parallel({
        cpu: cb => si.cpu(data => cb(null, data)),
        mem: cb => si.mem(data => cb(null, data)),
        engineVersion: odmInfo.getVersion
    }, (_, data) => {
        const { cpu, mem, engineVersion } = data;

        // For testing
        if (req.query._debugUnauthorized){
            res.writeHead(401, "unauthorized")
            res.end();
            return;
        }

        res.json({
            version: packageJson.version,
            taskQueueCount: taskManager.getQueueCount(),
            totalMemory: mem.total,
            availableMemory: mem.available,
            cpuCores: cpu.cores,
            maxImages: config.maxImages,
            maxParallelTasks: config.parallelQueueProcessing,
            engineVersion: engineVersion,
            engine: 'odm'
        });
    });
});

/** @swagger
 * /auth/info:
 *   get:
 *     description: Retrieves login information for this node.
 *     tags: [auth]
 *     responses:
 *       200:
 *         description: LoginInformation
 *         schema:
 *           type: object
 *           required: [message, loginUrl, registerUrl]
 *           properties:
 *             message:
 *               type: string
 *               description: Message to be displayed to the user prior to login/registration. This might include instructions on how to register or login, or to communicate that authentication is not available.
 *             loginUrl:
 *               type: string
 *               description: URL (absolute or relative) where to make a POST request to obtain a token, or null if login is disabled.
 *             registerUrl:
 *               type: string
 *               description: URL (absolute or relative) where to make a POST request to register a user, or null if registration is disabled.
 */
app.get('/auth/info', (req, res) => {
    res.json({
        message: "Authentication not available on this node", 
        loginUrl: null,
        registerUrl: null
    });
});

/** @swagger
 * /auth/login:
 *    post:
 *      description: Retrieve a token from a username/password pair.
 *      parameters:
 *        -
 *          name: username
 *          in: body
 *          description: Username
 *          required: true
 *          schema:
 *            type: string
 *        -
 *          name: password
 *          in: body
 *          description: Password
 *          required: true
 *          type: string
 *      responses:
 *        200:
 *          description: Login Succeeded
 *          schema:
 *            type: object
 *            required: [token]
 *            properties:
 *              token:
 *                type: string
 *                description: Token to be passed as a query parameter to other API calls.
 *        default:
 *          description: Error
 *          schema:
 *            $ref: '#/definitions/Error'
 */
app.post('/auth/login', (req, res) => {
    res.json({error: "Not available"});
});

/** @swagger
 * /auth/register:
 *    post:
 *      description: Register a new username/password.
 *      parameters:
 *        -
 *          name: username
 *          in: body
 *          description: Username
 *          required: true
 *          schema:
 *            type: string
 *        -
 *          name: password
 *          in: body
 *          description: Password
 *          required: true
 *          type: string
 *      responses:
 *        200:
 *          description: Response
 *          schema:
 *            $ref: "#/definitions/Response"
 */
app.post('/auth/register', (req, res) => {
    res.json({error: "Not available"});
});


app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.json({error: err.message});
});

let gracefulShutdown = done => {
    async.series([
        cb => taskManager.dumpTaskList(cb),
        cb => auth.cleanup(cb),
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
if (config.test) {
    logger.info("Running in test mode");
    if (config.testSkipOrthophotos) logger.info("Orthophotos will be skipped");
    if (config.testSkipDems) logger.info("DEMs will be skipped");
    if (config.testDropUploads) logger.info("Uploads will drop at random");
}

let commands = [
    cb => odmInfo.initialize(cb),
    cb => auth.initialize(cb),
    cb => S3.initialize(cb),
    cb => { 
        TaskManager.initialize(cb);
        taskManager = TaskManager.singleton();
    },
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
