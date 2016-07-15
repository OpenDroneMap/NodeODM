"use strict";
let assert = require('assert');
let fs = require('fs');
let Task = require('./Task');
let statusCodes = require('./statusCodes');
let async = require('async');

const PARALLEL_QUEUE_PROCESS_LIMIT = 2;
const TASKS_DUMP_FILE = "data/tasks.json";

module.exports = class TaskManager{
	constructor(done){
		this.tasks = {};
		this.runningQueue = [];

		async.series([
			cb => { this.restoreTaskListFromDump(cb); },
			cb => {
				this.processNextTask();
				cb();
			}
		], done);
		
	}

	// Load tasks that already exists (if any)
	restoreTaskListFromDump(done){
		fs.readFile(TASKS_DUMP_FILE, (err, data) => {
			if (!err){
				let tasks = JSON.parse(data.toString());

				async.each(tasks, (taskJson, done) => {
					Task.CreateFromSerialized(taskJson, (err, task) => {
						if (err) done(err);
						else{
							this.tasks[task.uuid] = task;
							done();
						}
					});
				}, err => {
					console.log(`Initialized ${tasks.length} tasks`);
					if (done !== undefined) done();
				});				
			}else{
				console.log("No tasks dump found");
				if (done !== undefined) done();
			}
		});
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
			if (!task.isCanceled()){
				task.cancel(err => {
					this.removeFromRunningQueue(task);
					this.processNextTask();
					cb(err);
				});
			}else{
				cb(null); // Nothing to be done
			}
		}
	}

	// Removes a task from the system.
	// Before being removed, the task is canceled.
	remove(uuid, cb){
		this.cancel(uuid, err => {
			if (!err){
				let task;
				if (task = this.find(uuid, cb)){
					task.cleanup(err => {
						if (!err){
							delete(this.tasks[uuid]);
							this.processNextTask();
							cb(null);
						}else cb(err);
					});
				}else; // cb is called by find on error
			}else cb(err);
		});
	}

	// Restarts (puts back into QUEUED state)
	// a task that is either in CANCELED or FAILED state.
	restart(uuid, cb){
		let task;
		if (task = this.find(uuid, cb)){
			task.restart(err => {
				if (!err) this.processNextTask();
				cb(err);
			});
		}
	}

	// Finds a task by its UUID string.
	find(uuid, cb){
		let task = this.tasks[uuid];
		if (!task && cb) cb(new Error(`${uuid} not found`));
		return task;
	}

	// Serializes the list of tasks and saves it
	// to disk
	dumpTaskList(done){
		var output = [];

		for (let uuid in this.tasks){
			output.push(this.tasks[uuid].serialize());
		}

		fs.writeFile(TASKS_DUMP_FILE, JSON.stringify(output), err => {
			if (err) console.log(`Could not dump tasks: ${err.message}`);
			else console.log("Dumped tasks list.");
			if (done !== undefined) done();
		})
	}
};