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
let fs = require('fs');
let os = require('os');
let path = require('path');
let assert = require('assert');
let spawn = require('child_process').spawn;
let config = require('../config.js');
let logger = require('./logger');
let utils = require('./utils');

module.exports = {
    run: function(options, projectName, done, outputReceived){
        assert(projectName !== undefined, "projectName must be specified");
        assert(options["project-path"] !== undefined, "project-path must be defined");
        
        const command = path.join(config.odm_path, os.platform() === "win32" ? "run.bat" : "run.sh"),
              params = [];

        for (var name in options){
            let value = options[name];

            // Skip false booleans
            if (value === false) continue;

            params.push("--" + name);

            // We don't specify "--time true" (just "--time")
            if (typeof value !== 'boolean'){
                params.push(value);
            }
        }

        params.push(projectName);

        logger.info(`About to run: ${command} ${params.join(" ")}`);

        if (config.test){
            logger.info("Test mode is on, command will not execute");

            let outputTestFile = path.join("..", "tests", "odm_output.txt");
            fs.readFile(path.resolve(__dirname, outputTestFile), 'utf8', (err, text) => {
                if (!err){
                    let lines = text.split("\n");
                    lines.forEach(line => outputReceived(line));
                    
                    done(null, 0, null);
                }else{
                    logger.warn(`Error: ${err.message}`);
                    done(err);
                }
            });

            return; // Skip rest
        }

        // Launch
        const env = utils.clone(process.env);
        env.ODM_NONINTERACTIVE = 1;
        let childProcess = spawn(command, params, {cwd: config.odm_path, env});

        childProcess
            .on('exit', (code, signal) => done(null, code, signal))
            .on('error', done);

        childProcess.stdout.on('data', chunk => outputReceived(chunk.toString()));
        childProcess.stderr.on('data', chunk => outputReceived(chunk.toString()));

        return childProcess;
    },
    
    getVersion: function(done){
        fs.readFile(path.join(config.odm_path, 'VERSION'), {encoding: 'utf8'}, (err, content) => {
            if (err) done(null, "?");
            else done(null, content.split("\n").map(l => l.trim())[0]);
        });
    },

    getEngine: function(done){
        fs.readFile(path.join(config.odm_path, 'ENGINE'), {encoding: 'utf8'}, (err, content) => {
            if (err) done(null, "odm"); // Assumed
            else done(null, content.split("\n").map(l => l.trim())[0]);
        });
    },

    getJsonOptions: function(done){
        // In test mode, we don't call ODM, 
        // instead we return a mock
        if (config.test){
            let optionsTestFile = path.join("..", "tests", "odm_options.json");
            fs.readFile(path.resolve(__dirname, optionsTestFile), 'utf8', (err, json) => {
                if (!err){
                    try{
                        let options = JSON.parse(json);
                        done(null, options);
                    }catch(e){
                        logger.warn(`Invalid test options ${optionsTestFile}: ${err.message}`);
                        done(e);
                    }
                }else{
                    logger.warn(`Error: ${err.message}`);
                    done(err);
                }
            });

            return; // Skip rest
        }

        const getOdmOptions = (pythonExe, done) => {
            // Launch
            const env = utils.clone(process.env);
            env.ODM_OPTIONS_TMP_FILE = utils.tmpPath(".json");
            env.ODM_PATH = config.odm_path;
            let childProcess = spawn(pythonExe, [path.join(__dirname, "..", "helpers", "odmOptionsToJson.py"),
                    "--project-path", config.odm_path, "bogusname"], { env });
    
            // Cleanup on done
            let handleResult = (err, result) => {
                fs.exists(env.ODM_OPTIONS_TMP_FILE, exists => {
                    if (exists) fs.unlink(env.ODM_OPTIONS_TMP_FILE, err => {
                        if (err) console.warning(`Cannot cleanup ${env.ODM_OPTIONS_TMP_FILE}`);
                    });
                });
    
                // Don't wait
                done(err, result);
            };
    
            childProcess
                .on('exit', (code, signal) => {
                    try{
                        fs.readFile(env.ODM_OPTIONS_TMP_FILE, { encoding: "utf8" }, (err, data) => {
                            if (err) handleResult(new Error(`Cannot read list of options from ODM (from temporary file). Is ODM installed in ${config.odm_path}?`));
                            else{
                                let json = JSON.parse(data);
                                handleResult(null, json);
                            }
                        });
                    }catch(err){
                        handleResult(new Error(`Could not load list of options from ODM. Is ODM installed in ${config.odm_path}? Make sure that OpenDroneMap is installed and that --odm_path is set properly: ${err.message}`));
                    }
                })
                .on('error', handleResult);
        }
        
        if (os.platform() === "win32"){
            getOdmOptions("helpers\\odm_python.bat", done);
        }else{
            // Try Python3 first
            getOdmOptions("python3", (err, result) => {
                if (err) getOdmOptions("python", done);
                else done(null, result);
            });
        }
    }
};
