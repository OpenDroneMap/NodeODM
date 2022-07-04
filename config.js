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
let apps = require('./libs/apps');
const spawnSync = require('child_process').spawnSync;

if (argv.help){
	console.log(`
Usage: node index.js [options]

Options:
	--config <path>	Path to the configuration file (default: config-default.json)	
	-p, --port <number> 	Port to bind the server to, or "auto" to automatically find an available port (default: 3000)
	--odm_path <path>	Path to OpenDroneMap's code	(default: /code)
	--log_level <logLevel>	Set log level verbosity (default: info)
	-d, --daemon 	Set process to run as a deamon
	-q, --parallel_queue_processing <number> Number of simultaneous processing tasks (default: 2)
	--cleanup_tasks_after <number> Number of minutes that elapse before deleting finished and canceled tasks (default: 2880) 
	--cleanup_uploads_after <number> Number of minutes that elapse before deleting unfinished uploads. Set this value to the maximum time you expect a dataset to be uploaded. (default: 2880) 
	--test Enable test mode. In test mode, no commands are sent to OpenDroneMap. This can be useful during development or testing (default: false)
	--test_skip_orthophotos	If test mode is enabled, skip orthophoto results when generating assets. (default: false) 
	--test_skip_dems	If test mode is enabled, skip dems results when generating assets. (default: false) 
	--test_drop_uploads	If test mode is enabled, drop /task/new/upload requests with 50% probability. (default: false)
	--test_fail_tasks	If test mode is enabled, mark tasks as failed. (default: false)
	--test_seconds	If test mode is enabled, sleep these many seconds before finishing processing a test task. (default: 0)
	--powercycle	When set, the application exits immediately after powering up. Useful for testing launch and compilation issues.
	--token <token>	Sets a token that needs to be passed for every request. This can be used to limit access to the node only to token holders. (default: none)
	--max_images <number>	Specify the maximum number of images that this processing node supports. (default: unlimited)
	--webhook <url>	Specify a POST URL endpoint to be invoked when a task completes processing (default: none)
	--s3_endpoint <url>	Specify a S3 endpoint (for example, nyc3.digitaloceanspaces.com) to upload completed task results to. (default: do not upload to S3)
	--s3_bucket <bucket>	Specify a S3 bucket name where to upload completed task results to. (default: none)
	--s3_access_key <key>	S3 access key, required if --s3_endpoint is set. (default: none)
	--s3_force_path_style  Whether to force path style URLs for S3 objects. (default: false)
	--s3_secret_key <secret>	S3 secret key, required if --s3_endpoint is set. (default: none) 
	--s3_signature_version <version>	S3 signature version. (default: 4)
	--s3_acl <canned-acl> S3 object acl. (default: public-read)
	--s3_upload_everything	Upload all task results to S3. (default: upload only all.zip archive)
	--max_concurrency   <number>	Place a cap on the max-concurrency option to use for each task. (default: no limit)
	--max_runtime	<number> Number of minutes (approximate) that a task is allowed to run before being forcibly canceled (timeout). (default: no limit)
Log Levels: 
error | debug | info | verbose | debug | silly 
`);
	process.exit(0);
}

const allOpts = ["slice","help","config","odm_path","log_level","port","p",
"deamonize","daemon","d","parallel_queue_processing","q",
"cleanup_tasks_after","cleanup_uploads_after","test","test_skip_orthophotos",
"test_skip_dems","test_drop_uploads","test_fail_tasks","test_seconds",
"powercycle","token","max_images","webhook","s3_endpoint","s3_bucket",
"s3_force_path_style","s3_access_key","s3_secret_key","s3_signature_version",
"s3_acl","s3_upload_everything","max_concurrency","max_runtime"];

// Support for "-" or "_" style params syntax
for (let k in argv){
    if (k === "_") continue;
    
    const opt = k.replace(/-/g, "_");
    argv[opt] = argv[k];
    if (allOpts.indexOf(opt) === -1){
        console.log(`warning: Unrecognized flag ${k}`);
    }
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

config.port = (argv.port || argv.p || fromConfigFile("port", process.env.PORT || "auto"));
config.deamon = argv.deamonize || argv.daemon || argv.d || fromConfigFile("daemon", false);
config.parallelQueueProcessing = parseInt(argv.parallel_queue_processing || argv.q || fromConfigFile("parallelQueueProcessing", 1));
config.cleanupTasksAfter = parseInt(argv.cleanup_tasks_after || fromConfigFile("cleanupTasksAfter", 2880));
config.cleanupUploadsAfter = parseInt(argv.cleanup_uploads_after || fromConfigFile("cleanupUploadsAfter", 2880));
config.test = argv.test || fromConfigFile("test", false);
config.testSkipOrthophotos = argv.test_skip_orthophotos || fromConfigFile("testSkipOrthophotos", false);
config.testSkipDems = argv.test_skip_dems || fromConfigFile("testSkipDems", false);
config.testDropUploads = argv.test_drop_uploads || fromConfigFile("testDropUploads", false);
config.testFailTasks = argv.test_fail_tasks || fromConfigFile("testFailTasks", false);
config.testSeconds = parseInt(argv.test_seconds || fromConfigFile("testSeconds", 0));
config.powercycle = argv.powercycle || fromConfigFile("powercycle", false);
config.token = argv.token || fromConfigFile("token", "");
config.authorizedIps = fromConfigFile("authorizedIps", []);
config.maxImages = parseInt(argv.max_images || fromConfigFile("maxImages", "")) || null;
config.webhook = argv.webhook || fromConfigFile("webhook", "");
config.s3Endpoint = argv.s3_endpoint || fromConfigFile("s3Endpoint", "");
config.s3Bucket = argv.s3_bucket || fromConfigFile("s3Bucket", "");
config.s3ForcePathStyle = argv.s3_force_path_style || fromConfigFile("s3ForcePathStyle", false);
config.s3AccessKey = argv.s3_access_key || fromConfigFile("s3AccessKey", process.env.AWS_ACCESS_KEY_ID || "")
config.s3SecretKey = argv.s3_secret_key || fromConfigFile("s3SecretKey", process.env.AWS_SECRET_ACCESS_KEY || "")
config.s3SignatureVersion = argv.s3_signature_version || fromConfigFile("s3SignatureVersion", "4")
config.s3ACL = argv.s3_acl || fromConfigFile("s3_acl", "public-read")
config.s3UploadEverything = argv.s3_upload_everything || fromConfigFile("s3UploadEverything", false);
config.maxConcurrency = parseInt(argv.max_concurrency || fromConfigFile("maxConcurrency", 0));
config.maxRuntime = parseInt(argv.max_runtime || fromConfigFile("maxRuntime", -1));

// Detect 7z availability
config.has7z = spawnSync(apps.sevenZ, ['--help']).status === 0;
config.hasUnzip = spawnSync(apps.unzip, ['--help']).status === 0;


module.exports = config;
