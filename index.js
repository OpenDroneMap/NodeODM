"use strict";

let fs = require('fs');
let express = require('express');
let app = express();

let addRequestId = require('./libs/express-request-id')();
let multer = require('multer');

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
	console.log(`Received ${req.files.length} files`);
	if (req.files.length){

	}
	console.log("Name: " + req.body.name);
	res.json({uuid: req.id, success: true});
});

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});