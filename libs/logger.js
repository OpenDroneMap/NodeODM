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

let config = require('../config');
let winston = require('winston');
let fs = require('fs');
let path = require('path');

// Set up logging
// Configure custom File transport to write plain text messages
let logPath = ( config.logger.logDirectory ? 
                config.logger.logDirectory : 
                path.join(__dirname, "..") );

// Check that log file directory can be written to
try {
    fs.accessSync(logPath, fs.W_OK);
} catch (e) {
    console.log( "Log directory '" + logPath + "' cannot be written to"  );
    throw e;
}
logPath += path.sep;
logPath += config.instance + ".log";

let transports = [];
if (!config.deamon){
    transports.push(new winston.transports.Console({ level: config.logger.level, format: winston.format.simple() }));
}

let logger = winston.createLogger({ transports });
logger.add(new winston.transports.File({
        format: winston.format.simple(), 
        filename: logPath, // Write to projectname.log
        json: false, // Write in plain text, not JSON
        maxsize: config.logger.maxFileSize, // Max size of each file
        maxFiles: config.logger.maxFiles, // Max number of files
        level: config.logger.level // Level of log messages
    }));

module.exports = logger;