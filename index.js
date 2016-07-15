"use strict";

let fs = require('fs');
let async = require('async');

let express = require('express');
let app = express();

let addRequestId = require('./libs/expressRequestId')();
let multer = require('multer');
let bodyParser = require('body-parser');
let morgan = require('morgan');
let TaskManager = require('./libs/taskManager');
let Task = require('./libs/Task');

app.use(morgan('tiny'));
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
		// Move to data
		async.series([
			cb => { 
				fs.stat(`data/${req.id}`, (err, stat) => {
					if (err && err.code === 'ENOENT') cb();
					else cb(new Error(`Directory exists (should not have happened: ${err.code})`));
				});
			},
			cb => { fs.mkdir(`data/${req.id}`, undefined, cb); },
			cb => {
				fs.rename(`tmp/${req.id}`, `data/${req.id}/images`, err => {
					if (!err){
						new Task(req.id, req.body.name, (err, task) => {
							if (err) cb(err);
							else{
								taskManager.addNew(task);
								res.json({uuid: req.id, success: true});
								cb();
							}
						});
					}else{
						cb(new Error("Could not move images folder."))
					}
				});
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

let gracefulShutdown = done => {
	async.series([
		cb => { taskManager.dumpTaskList(cb) },
		cb => { 
			console.log("Closing server");
			server.close();
			console.log("Exiting...");
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
	cb => { taskManager = new TaskManager(cb); },
	cb => { server = app.listen(3000, err => {
			if (!err) console.log('Server has started on port 3000');
			cb(err);
		});
	}
], err => {
	if (err) console.log("Error during startup: " + err.message);
});
