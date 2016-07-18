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
let spawn = require('child_process').spawn;

const ODM_PATH = "/code";

module.exports = {
	run: function(options = {
			projectPath: "/images"
		}, done, outputReceived){

		// Launch
		let childProcess = spawn("python", [`${ODM_PATH}/run.py`, 
				"--project-path", options.projectPath
			], {cwd: ODM_PATH});

		childProcess
			.on('exit', (code, signal) => {
				done(null, code, signal);
			})
			.on('error', done);

		childProcess.stdout.on('data', chunk => {
		  outputReceived(chunk.toString());
		});
		childProcess.stderr.on('data', chunk => {
		  outputReceived(chunk.toString());
		});

		return childProcess;
	}
};
