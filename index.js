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

let config = require('./config.js')

let logger = require('winston');
let fs = require('fs');
let path = require('path');
let async = require('async');

let express = require('express');
let app = express();

let addRequestId = require('./libs/expressRequestId')();
let multer = require('multer');
let bodyParser = require('body-parser');
let morgan = require('morgan');

// Set up logging
// Configure custom File transport to write plain text messages
let logPath = ( config.logger.logDirectory ? config.logger.logDirectory : __dirname );
// Check that log file directory can be written to
try {
	fs.accessSync(logPath, fs.W_OK);
} catch (e) {
	console.log( "Log directory '" + logPath + "' cannot be written to"  );
	throw e;
}
logPath += path.sep;
logPath += config.instance + ".log";

logger
	.add(logger.transports.File, {
		filename: logPath, // Write to projectname.log
		json: false, // Write in plain text, not JSON
		maxsize: config.logger.maxFileSize, // Max size of each file
		maxFiles: config.logger.maxFiles, // Max number of files
		level: config.logger.level // Level of log messages
	})
	// Console transport is no use to us when running as a daemon
	.remove(logger.transports.Console);

let winstonStream = {
    write: function(message, encoding){
    	logger.info(message.slice(0, -1));
    }
};

let TaskManager = require('./libs/TaskManager');
let Task = require('./libs/Task');
let odmOptions = require('./libs/odmOptions');

app.use(morgan('combined', { stream : winstonStream }));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.static('public'));

let upload = multer({
	storage: multer.diskStorage({
	  destination: (req, file, cb) => {
	  	let path = `tmp/${req.id}/`;
	  	fs.exists(path, exists => {
	  		if (!exists){
	  			fs.mkdir(path, undefined, () => {
	  				cb(null, path);
	  			});
	  		}else{
	    		cb(null, path);
	  		}
	  	});
	  },
	  filename: (req, file, cb) => {
	    cb(null, file.originalname)
	  }
	})
});

app.post('/task/new', addRequestId, upload.array('images'), (req, res) => {
	if (req.files.length === 0) res.json({error: "Need at least 1 file."});
	else{
		async.series([
			cb => {
				odmOptions.filterOptions(req.body.options, (err, options) => {
					if (err) cb(err);
					else{
						req.body.options = options;
						cb(null);
					}
				});
			},

			// Move uploads to data dir
			cb => {
				fs.stat(`data/${req.id}`, (err, stat) => {
					if (err && err.code === 'ENOENT') cb();
					else cb(new Error(`Directory exists (should not have happened: ${err.code})`));
				});
			},
			cb => { fs.mkdir(`data/${req.id}`, undefined, cb); },
			cb => {
				fs.rename(`tmp/${req.id}`, `data/${req.id}/images`, err => {
					if (!err) cb();
					else cb(new Error("Could not move images folder."))
				});
			},

			// Create task
			cb => {
				new Task(req.id, req.body.name, (err, task) => {
					if (err) cb(err);
					else{
						taskManager.addNew(task);
						res.json({uuid: req.id, success: true});
						cb();
					}
				}, req.body.options);
			}
		], err => {
			if (err) res.json({error: err.message})
		});
	}
});

let getTaskFromUuid = (req, res, next) => {
	let task = taskManager.find(req.params.uuid);
	if (task){
		req.task = task;
		next();
	}else res.json({error: `${req.params.uuid} not found`});
}

app.get('/task/:uuid/info', getTaskFromUuid, (req, res) => {
	res.json(req.task.getInfo());
});
app.get('/task/:uuid/output', getTaskFromUuid, (req, res) => {
	res.json(req.task.getOutput(req.query.line));
});
app.get('/task/:uuid/download/:asset', getTaskFromUuid, (req, res) => {
	if (!req.params.asset || req.params.asset === "all"){
		res.download(req.task.getAssetsArchivePath(), "all.zip", err => {
			if (err) res.json({error: "Asset not ready"});
		});
	}else{
		res.json({error: "Invalid asset"});
	}
});

let uuidCheck = (req, res, next) => {
	if (!req.body.uuid) res.json({error: "uuid param missing."});
	else next();
};

let successHandler = res => {
	return err => {
		if (!err) res.json({success: true});
		else res.json({error: err.message});
	};
};

app.post('/task/cancel', uuidCheck, (req, res) => {
	taskManager.cancel(req.body.uuid, successHandler(res));
});

app.post('/task/remove', uuidCheck, (req, res) => {
	taskManager.remove(req.body.uuid, successHandler(res));
});

app.post('/task/restart', uuidCheck, (req, res) => {
	taskManager.restart(req.body.uuid, successHandler(res));
});

app.get('/getOptions', (req, res) => {
	odmOptions.getOptions((err, options) => {
		if (err) res.json({error: err.message});
		else res.json(options);
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
process.on ('SIGTERM', gracefulShutdown);

// listen for INT signal e.g. Ctrl-C
process.on ('SIGINT', gracefulShutdown);

// Startup
let taskManager;
let server;

async.series([
	cb => { taskManager = new TaskManager(cb,logger); },
	cb => { server = app.listen(config.port, err => {
			if (!err) logger.info('Server has started on port ' + String(config.port));
			cb(err);
		});
	}
], err => {
	if (err) logger.error("Error during startup: " + err.message);
});
