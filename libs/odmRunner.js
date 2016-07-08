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
