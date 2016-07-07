"use strict";
let assert = require('assert');
let Task = require('./Task');

module.exports = class TaskManager{
	constructor(){
		this.tasks = {};
	}

	addNew(task){
		assert(task.constructor.name === "Task", "Must be a Task object");
		this.tasks[task.uuid] = task;
	}

	cancel(uuid, cb){
		let task;
		if (task = this.find(uuid, cb)){
			task.cancel(cb);
		}
	}

	remove(uuid, cb){
		this.cancel(uuid, err => {
			if (!err){
				delete(this.tasks[uuid]);
				// TODO: other cleanup
				cb(null);
			}else cb(err);
		});
	}

	restart(uuid, cb){
		let task;
		if (task = this.find(uuid, cb)){
			task.restart(cb);
		}
	}

	find(uuid, errCb){
		let task = this.tasks[uuid];
		if (!task && errCb) errCb(new Error(`${uuid} not found`));
		return task;
	}
};