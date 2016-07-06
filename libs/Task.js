"use strict";
let assert = require('assert');

let statusCodes = {
	QUEUED: 10,
	RUNNING: 20,
	FAILED: 30,
	COMPLETED: 40
};

module.exports = class Task{
	constructor(uuid, name){
		assert(uuid !== undefined, "uuid must be set");

		this.uuid = uuid;
		this.name = name != "" ? name : "Task of " + (new Date()).toISOString();
		this.dateCreated = new Date().getTime();
		this.status = {
			code: statusCodes.QUEUED
		};
		this.options = {};
	}

	getInfo(){
		return {
			uuid: this.uuid,
			name: this.name,
			dateCreated: this.dateCreated,
			status: this.status,
			options: this.options
		}
	}
};