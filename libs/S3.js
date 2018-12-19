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
const async = require('async');
const AWS = require('aws-sdk');
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const logger = require('./logger');
const config = require('../config');

let s3 = null;

module.exports = {
    enabled: function(){
        return s3 !== null;
    },

    initialize: function(cb){
        if (config.s3Endpoint && config.s3Bucket && config.s3AccessKey && config.s3SecretKey){
            const spacesEndpoint = new AWS.Endpoint(config.s3Endpoint);
            s3 = new AWS.S3({
                endpoint: spacesEndpoint,
                signatureVersion: ('v' + config.s3SignatureVersion) || 'v4',
                accessKeyId: config.s3AccessKey,
                secretAccessKey: config.s3SecretKey
            });

            // Test connection
            s3.putObject({
                Bucket: config.s3Bucket,
                Key: 'test.txt',
                Body: ''
            }, err => {
                if (!err){
                    logger.info("Connected to S3");
                    cb();
                }else{
                    cb(new Error("Cannot connect to S3. Check your S3 configuration: " + err.code));
                }
            });
        }else cb();
    },

    // @param srcFolder {String} folder where to find paths (on local machine)
    // @param bucket {String} S3 destination bucket
    // @param dstFolder {String} prefix where to upload files on S3
    // @param paths [{String}] list of paths relative to srcFolder
    // @param cb {Function} callback
    // @param onOutput {Function} (optional) callback when output lines are available
    uploadPaths: function(srcFolder, bucket, dstFolder, paths, cb, onOutput){
        if (!s3) throw new Error("S3 is not initialized");

        const PARALLEL_UPLOADS = 5;
        const MAX_RETRIES = 6;

        const q = async.queue((file, done) => {
            logger.debug(`Uploading ${file.src} --> ${file.dest}`);
            s3.upload({
                Bucket: bucket,
                Key: file.dest,
                Body: fs.createReadStream(file.src),
                ACL: 'public-read'
            }, {partSize: 5 * 1024 * 1024, queueSize: 1}, err => {
                if (err){
                    logger.debug(err);
                    const msg = `Cannot upload file to S3: ${err.code}, retrying... ${file.retries}`;
                    if (onOutput) onOutput(msg);
                    if (file.retries < MAX_RETRIES){
                        file.retries++;
                        setTimeout(() => {
                            q.push(file, errHandler);
                            done();
                        }, (2 ** file.retries) * 1000);
                    }else{
                        done(new Error(msg));
                    }
                }else done();
            });
        }, PARALLEL_UPLOADS);

        const errHandler = err => {
            if (err){
                q.kill();
                if (!cbCalled){
                    cbCalled = true;
                    cb(err);
                }
            }
        };

        let uploadList = [];

        paths.forEach(p => {
            const fullPath = path.join(srcFolder, p);
            
            // Skip non-existing items
            if (!fs.existsSync(fullPath)) return;

            if (fs.lstatSync(fullPath).isDirectory()){
                let globPaths = glob.sync(`${p}/**`, { cwd: srcFolder, nodir: true, nosort: true });

                globPaths.forEach(gp => {
                    uploadList.push({
                        src: path.join(srcFolder, gp),
                        dest: path.join(dstFolder, gp),
                        retries: 0
                    });
                });
            }else{
                uploadList.push({
                    src: fullPath,
                    dest: path.join(dstFolder, p),
                    retries: 0
                });
            }
        });

        let cbCalled = false;
        q.drain = () => {
            if (!cbCalled){
                cbCalled = true;
                cb();
            }
        };

        if (onOutput) onOutput(`Uploading ${uploadList.length} files to S3...`);
        q.push(uploadList, errHandler);
    }
};
