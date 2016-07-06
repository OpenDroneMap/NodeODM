"use strict";

let fs = require('fs');
let express = require('express');
let app = express();

let addRequestId = require('./libs/express-request-id')();
let multer = require('multer');

let taskManager = new (require('./libs/taskManager'))();
let Task = require('./libs/Task');

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

app.post('/newTask', addRequestId, upload.array('images'), (req, res, next) => {
	if (req.files.length === 0) res.json({error: "Need at least 1 file."});
	else{
		console.log(`Received ${req.files.length} files`);

		// Move to data
		fs.rename(`tmp/${req.id}`, `data/${req.id}`, (err) => {
			if (!err){
				taskManager.addNew(new Task(req.id, req.body.name));
				res.json({uuid: req.id, success: true});
			}else{
				res.json({error: "Could not move images folder."});
			}
		});
	}
});

app.get('/taskInfo/:uuid', (req, res, next) => {
	let task = taskManager.find(req.params.uuid);
	if (task){
		res.json(task.getInfo());
	}else res.json({error: `${req.params.uuid} not found`});
});

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});