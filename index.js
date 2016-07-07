"use strict";

let fs = require('fs');
let express = require('express');
let app = express();

let addRequestId = require('./libs/express-request-id')();
let multer = require('multer');
let bodyParser = require('body-parser');

let taskManager = new (require('./libs/taskManager'))();
let Task = require('./libs/Task');

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

app.post('/newTask', addRequestId, upload.array('images'), (req, res) => {
	if (req.files.length === 0) res.json({error: "Need at least 1 file."});
	else{
		console.log(`Received ${req.files.length} files`);

		// Move to data
		fs.rename(`tmp/${req.id}`, `data/${req.id}`, err => {
			if (!err){
				new Task(req.id, req.body.name, (err, task) => {
					if (err) res.json({error: err.message});
					else{
						taskManager.addNew(task);
						res.json({uuid: req.id, success: true});
					}
				});
			}else{
				res.json({error: "Could not move images folder."});
			}
		});
	}
});

app.get('/taskInfo/:uuid', (req, res) => {
	let task = taskManager.find(req.params.uuid);
	if (task){
		res.json(task.getInfo());
	}else res.json({error: `${req.params.uuid} not found`});
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

app.post('/cancelTask', uuidCheck, (req, res) => {
	taskManager.cancel(req.body.uuid, successHandler(res));
});

app.post('/removeTask', uuidCheck, (req, res) => {
	taskManager.remove(req.body.uuid, successHandler(res));
});

app.post('/restartTask', uuidCheck, (req, res) => {
	taskManager.restart(req.body.uuid, successHandler(res));
});

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});