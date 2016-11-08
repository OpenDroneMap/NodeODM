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
	runTiler: function(options, done, outputReceived){
		assert(options.zoomLevels !== undefined, "zoomLevels must be defined");
		assert(options.inputFile !== undefined, "inputFile must be defined");
		assert(options.outputDir !== undefined, "outputDir must be defined");

		let command = ["-z", options.zoomLevels,
						"-n", 
						options.inputFile, 
						options.outputDir
					];
		logger.info(`About to run: gdal2tiles.py ${command.join(" ")}`);

		if (config.test){
			logger.info("Test mode is on, command will not execute");

			let outputTestFile = path.join("..", "tests", "gdal2tiles_output.txt");
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

			return;// Skip rest
		}

		// Launch
		let childProcess = spawn("gdal2tiles.py", command);

		childProcess
			.on('exit', (code, signal) => done(null, code, signal))
			.on('error', done);

		childProcess.stdout.on('data', chunk => outputReceived(chunk.toString()));
		childProcess.stderr.on('data', chunk => outputReceived(chunk.toString()));

		return childProcess;
	}
};
