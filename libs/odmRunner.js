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
let path = require('path');
let assert = require('assert');
let spawn = require('child_process').spawn;
let config = require('../config.js');
let logger = require('./logger');


module.exports = {
	run: function(options, done, outputReceived){
		assert(options["project-path"] !== undefined, "project-path must be defined");

		let command = [`${config.odm_path}/run.py`];
		for (var name in options){
			let value = options[name];

			// Skip false booleans
			if (value === false) continue;

			command.push("--" + name);

			// We don't specify "--time true" (just "--time")
			if (typeof value !== 'boolean'){
				command.push(value);
			}
		}

		logger.info(`About to run: python ${command.join(" ")}`);

		if (config.test){
			logger.info("Test mode is on, command will not execute");

			// TODO: simulate test output
			done(null, 0, null);

			return; // Skip rest
		}

		// Launch
		let childProcess = spawn("python", command, {cwd: config.odm_path});

		childProcess
			.on('exit', (code, signal) => done(null, code, signal))
			.on('error', done);

		childProcess.stdout.on('data', chunk => outputReceived(chunk.toString()));
		childProcess.stderr.on('data', chunk => outputReceived(chunk.toString()));

		return childProcess;
	},

	getJsonOptions: function(done){
		// In test mode, we don't call ODM, 
		// instead we return a mock
		if (config.test){
			let optionsTestFile = "../tests/odm_options.json";
			fs.readFile(path.resolve(__dirname, optionsTestFile), 'utf8', (err, json) => {
				if (!err){
					try{
						let options = JSON.parse(json);
						
						// We also mark each description with "TEST" (to make sure we know this is not real data)
						options.forEach(option => { option.help = "## TEST ##" + (option.help !== undefined ? ` ${option.help}` : ""); });

						done(null, options);
					}catch(e){
						console.log(`Invalid test options ${optionsTestFile}: ${err.message}`);
						done(e);
					}
				}else{
					console.log(`Error: ${err.message}`);
					done(err);
				}
			});

			return; // Skip rest
		}

		// Launch
		let childProcess = spawn("python", [`${__dirname}/../helpers/odmOptionsToJson.py`,
				"--project-path", config.odm_path]);
		let output = [];

		childProcess
			.on('exit', (code, signal) => {
				try{
					let json = JSON.parse(output.join(""));
					done(null, json);
				}catch(err){
					done(err);
				}
			})
			.on('error', done);

		let processOutput = chunk => output.push(chunk.toString());

		childProcess.stdout.on('data', processOutput);
		childProcess.stderr.on('data', processOutput);
	}
};
