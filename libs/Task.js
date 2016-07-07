"use strict";
let assert = require('assert');
let fs = require('fs');

let statusCodes = {
	QUEUED: 10,
	RUNNING: 20,
	FAILED: 30,
	COMPLETED: 40,
	CANCELED: 50
};

module.exports = class Task{
	constructor(uuid, name, readyCb){
		assert(uuid !== undefined, "uuid must be set");
		assert(readyCb !== undefined, "ready must be set");

		this.uuid = uuid;
		this.name = name != "" ? name : "Task of " + (new Date()).toISOString();
		this.dateCreated = new Date().getTime();
		this.status = {
			code: statusCodes.QUEUED
		};
		this.options = {};

		// Read images info
		fs.readdir(`data/${this.uuid}`, (err, files) => {
			if (err) readyCb(err);
			else{
				this.images = files;
				readyCb(null, this);
			}
		});
	}

	cancel(cb){
		if (this.status.code !== statusCodes.CANCELED){
			this.status.code = statusCodes.CANCELED;

			console.log("Requested to cancel " + this.name);
			// TODO
			cb(null);
		}else{
			cb(new Error("Task already cancelled"));
		}
	}

	restart(cb){
		if (this.status.code === statusCodes.CANCELED){
			this.status.code = statusCodes.QUEUED;

			console.log("Requested to restart " + this.name);
			// TODO

			cb(null);
		}else{
			cb(new Error("Task cannot be restarted"));
		}
	}

	getInfo(){
		return {
			uuid: this.uuid,
			name: this.name,
			dateCreated: this.dateCreated,
			status: this.status,
			options: this.options,
			imagesCount: this.images.length
		}
	}
};