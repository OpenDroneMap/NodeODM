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

	find(uuid){
		return this.tasks[uuid];
	}
};