"use strict";
let assert = require('assert');
let Task = require('./Task');
let statusCodes = require('./statusCodes');

let PARALLEL_QUEUE_PROCESS_LIMIT = 1;

module.exports = class TaskManager{
	constructor(){
		this.tasks = {};
		this.runningQueue = [];
	}

	// Finds the first QUEUED task.
	findNextTaskToProcess(){
		for (let uuid in this.tasks){
			if (this.tasks[uuid].getStatus() === statusCodes.QUEUED){
				return this.tasks[uuid];
			}
		}
	}

	// Finds the next tasks, adds them to the running queue,
	// and starts the tasks (up to the limit).
	processNextTask(){
		if (this.runningQueue.length < PARALLEL_QUEUE_PROCESS_LIMIT){
			let task = this.findNextTaskToProcess();
			if (task){
				this.addToRunningQueue(task);
				task.start(() => {
					this.removeFromRunningQueue(task);
					this.processNextTask();
				});

				if (this.runningQueue.length < PARALLEL_QUEUE_PROCESS_LIMIT) this.processNextTask();
			}
		}else{
			// Do nothing
		}
	}

	addToRunningQueue(task){
		assert(task.constructor.name === "Task", "Must be a Task object");
		this.runningQueue.push(task);
	}

	removeFromRunningQueue(task){
		assert(task.constructor.name === "Task", "Must be a Task object");
		
		this.runningQueue = this.runningQueue.filter(t => {
			return t !== task;
		});

		console.log("New queue length: " + this.runningQueue.length);
	}

	addNew(task){
		assert(task.constructor.name === "Task", "Must be a Task object");
		this.tasks[task.uuid] = task;

		this.processNextTask();
	}

	// Stops the execution of a task
	// (without removing it from the system).
	cancel(uuid, cb){
		let task;
		if (task = this.find(uuid, cb)){
			task.cancel(err => {
				this.removeFromRunningQueue(task);
				cb(err);
			});
		}
	}

	// Removes a task from the system.
	// Before being removed, the task is canceled.
	remove(uuid, cb){
		this.cancel(uuid, err => {
			if (!err){
				delete(this.tasks[uuid]);
				// TODO: other cleanup
				cb(null);
			}else cb(err);
		});
	}

	// Restarts (puts back into QUEUED state)
	// a task that is either in CANCELED or FAILED state.
	restart(uuid, cb){
		let task;
		if (task = this.find(uuid, cb)){
			task.restart(cb);
		}
	}

	// Finds a task by its UUID string.
	find(uuid, cb){
		let task = this.tasks[uuid];
		if (!task && cb) cb(new Error(`${uuid} not found`));
		return task;
	}
};