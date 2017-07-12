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
'use strict';

let fs = require('fs');
let argv = require('minimist')(process.argv.slice(2));
let utils = require('./libs/utils');

if (argv.help){
	console.log(`
Usage: node index.js [options]

Options:
	--config	<path>	Path to the configuration file (default: config-default.json)	
	-p, --port <number> 	Port to bind the server to (default: 3000)
	--odm_path <path>	Path to OpenDroneMap's code	(default: /code)
	--log_level <logLevel>	Set log level verbosity (default: info)
	-d, --deamonize 	Set process to run as a deamon
	--parallel_queue_processing <number> Number of simultaneous processing tasks (default: 2)
	--cleanup_tasks_after <number> Number of days that elapse before deleting finished and canceled tasks (default: 3) 
	--test Enable test mode. In test mode, no commands are sent to OpenDroneMap. This can be useful during development or testing (default: false)
	--test_skip_orthophotos	If test mode is enabled, skip orthophoto results when generating assets. (default: false) 
	--test_skip_dems	If test mode is enabled, skip dems results when generating assets. (default: false) 
	--powercycle	When set, the application exits immediately after powering up. Useful for testing launch and compilation issues.
Log Levels: 
error | debug | info | verbose | debug | silly 
`);
	process.exit(0);
}

let config = {};

// Read configuration from file
let configFilePath = argv.config || "config-default.json";
let configFile = {};

if (/\.json$/i.test(configFilePath)){
	try{
		let data = fs.readFileSync(configFilePath);
		configFile = JSON.parse(data.toString());
	}catch(e){
		console.log(`Invalid configuration file ${configFilePath}`);
		process.exit(1);
	}
}

// Gets a property that might not exist from configuration file
// example: fromConfigFile("logger.maxFileSize", 1000);
function fromConfigFile(prop, defaultValue){
	return utils.get(configFile, prop, defaultValue);
}

// Instance name - default name for this configuration
config.instance = fromConfigFile("instance", 'node-OpenDroneMap');
config.odm_path = argv.odm_path || fromConfigFile("odm_path", '/code');

// Logging configuration
config.logger = {};
config.logger.level = argv.log_level || fromConfigFile("logger.level", 'info'); // What level to log at; info, verbose or debug are most useful. Levels are (npm defaults): silly, debug, verbose, info, warn, error.
config.logger.maxFileSize = fromConfigFile("logger.maxFileSize", 1024 * 1024 * 100); // Max file size in bytes of each log file; default 100MB
config.logger.maxFiles = fromConfigFile("logger.maxFiles", 10); // Max number of log files kept
config.logger.logDirectory = fromConfigFile("logger.logDirectory", ''); // Set this to a full path to a directory - if not set logs will be written to the application directory.

config.port = parseInt(argv.port || argv.p || fromConfigFile("port", process.env.PORT || 3000));
config.deamon = argv.deamonize || argv.d || fromConfigFile("daemon", false);
config.parallelQueueProcessing = argv.parallel_queue_processing || fromConfigFile("parallelQueueProcessing", 2);
config.cleanupTasksAfter = argv.cleanup_tasks_after || fromConfigFile("cleanupTasksAfter", 3);
config.test = argv.test || fromConfigFile("test", false);
config.testSkipOrthophotos = argv.test_skip_orthophotos || fromConfigFile("testSkipOrthophotos", false);
config.testSkipDems = argv.test_skip_dems || fromConfigFile("testSkipDems", false);
config.powercycle = argv.powercycle || fromConfigFile("powercycle", false);

module.exports = config;
