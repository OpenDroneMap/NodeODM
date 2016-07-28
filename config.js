'use strict';

// config.js - Configuration for cognicity-server

/**
 * Cognicity server configuration object.
 * @namespace {object} config
 * @property {string} instance The name of this instance of the server
 * @property {object} logger Configuration options for logging
 * @property {string} logger.level Log level - info, verbose or debug are most useful. Levels are (npm defaults): silly, debug, verbose, info, warn, error.
 * @property {number} logger.maxFileSize Maximum size of each log file in bytes
 * @property {number} logger.maxFiles Maximum number of log files to keep
 * @property {?number} logger.logDirectory Full path to directory to store log files in, if not set logs will be written to the application directory
 * @property {number} port Port to launch server on
 */

let config = {};

// Instance name - default name for this configuration (will be server process name)
config.instance = 'node-OpenDroneMap';


// Logging configuration
config.logger = {};
config.logger.level = "debug"; // What level to log at; info, verbose or debug are most useful. Levels are (npm defaults): silly, debug, verbose, info, warn, error.
config.logger.maxFileSize = 1024 * 1024 * 100; // Max file size in bytes of each log file; default 100MB
config.logger.maxFiles = 10; // Max number of log files kept
config.logger.logDirectory = ''; // Set this to a full path to a directory - if not set logs will be written to the application directory.

// Server port
config.port = process.env.PORT || 3000;
// process.env.PORT is what AWS Elastic Beanstalk defines
// on IBM bluemix use config.port = process.env.VCAP_APP_PORT || 8081;

module.exports = config;
