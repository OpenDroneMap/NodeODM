/*
Node-OpenDroneMap Node.js App and REST API to access OpenDroneMap.
Copyright (C) 2016 Node-OpenDroneMap Contributors

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
"use strict";
const assert = require('assert');
const config = require('../config');
const rmdir = require('rimraf');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const Task = require('./Task');
const statusCodes = require('./statusCodes');
const async = require('async');
const schedule = require('node-schedule');
const Directories = require('./Directories');

const TASKS_DUMP_FILE = path.join(Directories.data, "tasks.json");
const CLEANUP_TASKS_IF_OLDER_THAN = 1000 * 60 * config.cleanupTasksAfter; // minutes

let taskManager;

class TaskManager{
    constructor(done){
        this.tasks = {};
        this.runningQueue = [];

        async.series([
            cb => this.restoreTaskListFromDump(cb),
            cb => this.removeOldTasks(cb),
            cb => this.removeOrphanedDirectories(cb),
            cb => {
                this.processNextTask();
                cb();
            },
            cb => {
                // Every hour
                schedule.scheduleJob('0 * * * *', () => {
                    this.removeOldTasks();
                    this.dumpTaskList();
                });

                cb();
            }
        ], done);
    }

    // Removes old tasks that have either failed, are completed, or
    // have been canceled.
    removeOldTasks(done){
        let list = [];
        let now = new Date().getTime();
        logger.debug("Checking for old tasks to be removed...");

        for (let uuid in this.tasks){
            let task = this.tasks[uuid];

            if ([statusCodes.FAILED,
                statusCodes.COMPLETED,
                statusCodes.CANCELED].indexOf(task.status.code) !== -1 &&
                now - task.dateCreated > CLEANUP_TASKS_IF_OLDER_THAN){
                list.push(task.uuid);
            }
        }

        async.eachSeries(list, (uuid, cb) => {
            logger.info(`Cleaning up old task ${uuid}`);
            this.remove(uuid, cb);
        }, done);
    }

    // Removes directories that don't have a corresponding
    // task associated with it (maybe as a cause of an abrupt exit)
    // TODO: do not delete /task/new/init directories!!!
    removeOrphanedDirectories(done){
        logger.info("Checking for orphaned directories to be removed...");

        fs.readdir(Directories.data, (err, entries) => {
            if (err) done(err);
            else{
                async.eachSeries(entries, (entry, cb) => {
                    let dirPath = path.join(Directories.data, entry);
                    if (fs.statSync(dirPath).isDirectory() &&
                        entry.match(/^[\w\d]+\-[\w\d]+\-[\w\d]+\-[\w\d]+\-[\w\d]+$/) &&
                        !this.tasks[entry]){
                        logger.info(`Found orphaned directory: ${entry}, removing...`);
                        rmdir(dirPath, cb);
                    }else cb();
                }, done);
            }
        });
    }

    // Load tasks that already exists (if any)
    restoreTaskListFromDump(done){
        fs.readFile(TASKS_DUMP_FILE, (err, data) => {
            if (!err){
                let tasks;
                try{
                    tasks = JSON.parse(data.toString());
                }catch(e){
                    done(new Error(`Could not load task list. It looks like the ${TASKS_DUMP_FILE} is corrupted (${e.message}). Please manually delete the file and try again.`));
                    return;
                }

                async.each(tasks, (taskJson, done) => {
                    Task.CreateFromSerialized(taskJson, (err, task) => {
                        if (err) done(err);
                        else{
                            this.tasks[task.uuid] = task;
                            done();
                        }
                    });
                }, err => {
                    logger.info(`Initialized ${tasks.length} tasks`);
                    if (done !== undefined) done();
                });
            }else{
                logger.info("No tasks dump found");
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
        if (this.runningQueue.length < config.parallelQueueProcessing){
            let task = this.findNextTaskToProcess();
            if (task){
                this.addToRunningQueue(task);
                task.start(() => {

                    task.callWebhooks();

                    this.removeFromRunningQueue(task);
                    this.processNextTask();
                });

                if (this.runningQueue.length < config.parallelQueueProcessing) this.processNextTask();
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
        this.runningQueue = this.runningQueue.filter(t => t !== task);
    }

    addNew(task){
        assert(task.constructor.name === "Task", "Must be a Task object");
        this.tasks[task.uuid] = task;

        this.processNextTask();
    }

    // Stops the execution of a task
    // (without removing it from the system).
    cancel(uuid, cb){
        let task = this.find(uuid, cb);
        if (task){
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
                let task = this.find(uuid, cb);
                if (task){
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
    // When options is set, the task's options are overriden
    restart(uuid, options, cb){
        let task = this.find(uuid, cb);
        if (task){
            task.restart(options, err => {
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
        let output = [];

        for (let uuid in this.tasks){
            output.push(this.tasks[uuid].serialize());
        }

        fs.writeFile(TASKS_DUMP_FILE, JSON.stringify(output), err => {
            if (err) logger.error(`Could not dump tasks: ${err.message}`);
            else logger.debug("Dumped tasks list.");
            if (done !== undefined) done();
        });
    }

    getQueueCount(){
        let count = 0;
        for (let uuid in this.tasks){
            let task = this.tasks[uuid];

            if ([statusCodes.QUEUED,
                statusCodes.RUNNING].indexOf(task.status.code) !== -1){
                count++;
            }
        }
        return count;
    }
}

module.exports = {
    singleton: function(){ return taskManager; },
    initialize: function(cb){ 
        taskManager = new TaskManager(cb);
    }
};