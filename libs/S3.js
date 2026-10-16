/*
NodeODX App and REST API to access ODX.
Copyright (C) 2026 NodeODX Contributors

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
"use strict";
const async = require('async');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler');
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const logger = require('./logger');
const config = require('../config');
const https = require('https');
const si = require('systeminformation');

let s3 = null;

module.exports = {
    enabled: function(){
        return s3 !== null;
    },

    initialize: function(cb){
        if (config.s3Endpoint && config.s3Bucket){
            // Ensure the endpoint has a protocol prefix
            let endpoint = config.s3Endpoint;
            if (!/^https?:\/\//i.test(endpoint)){
                endpoint = 'https://' + endpoint;
            }

            const s3Config = {
                endpoint: endpoint,
                forcePathStyle: config.s3ForcePathStyle,
                region: 'us-east-1',
            };

            // If we are not using IAM roles then we need to pass access key and secret key in our config
            if (config.s3AccessKey && config.s3SecretKey) {
                s3Config.credentials = {
                    accessKeyId: config.s3AccessKey,
                    secretAccessKey: config.s3SecretKey,
                };
            }else{
                logger.info("Secret Key and Access ID not passed. Using the IAM role");
            }

            if (config.s3IgnoreSSL){
                s3Config.requestHandler = new NodeHttpHandler({
                    httpsAgent: new https.Agent({
                        rejectUnauthorized: false,
                    }),
                });
            }

            s3 = new S3Client(s3Config);

            // Test connection
            const testCmd = new PutObjectCommand({
                Bucket: config.s3Bucket,
                Key: 'test.txt',
                Body: '',
            });

            s3.send(testCmd).then(() => {
                logger.info("Connected to S3");
                cb();
            }).catch(err => {
                cb(new Error(`Cannot connect to S3. Check your S3 configuration: ${err.message} (${err.Code || err.name})`));
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

        const PARALLEL_UPLOADS = 4; // Upload these many files at the same time
        const MAX_RETRIES = 6;
        const MIN_PART_SIZE = 5 * 1024 * 1024;

        // Get available memory, as on low-powered machines
        // we might not be able to upload many large chunks at once
        si.mem(memory => {
            let concurrency = 10; // Upload these many parts per file at the same time
            let progress = {};

            let partSize = 100 * 1024 * 1024;
            let memoryRequirement = partSize * concurrency * PARALLEL_UPLOADS; // Conservative

            // Try reducing concurrency first
            while(memoryRequirement > memory.available && concurrency > 1){
                concurrency--;
                memoryRequirement = partSize * concurrency * PARALLEL_UPLOADS;
            }

            // Try reducing partSize afterwards
            while(memoryRequirement > memory.available && partSize > MIN_PART_SIZE){
                partSize = Math.max(MIN_PART_SIZE, Math.floor(partSize * 0.80));
                memoryRequirement = partSize * concurrency * PARALLEL_UPLOADS;
            }

            const q = async.queue((file, done) => {
                logger.debug(`Uploading ${file.src} --> ${file.dest}`);
                const filename = path.basename(file.dest);
                progress[filename] = 0;

                let uploadParams = {
                    Bucket: bucket,
                    Key: file.dest,
                    Body: fs.createReadStream(file.src),
                };

                if (config.s3ACL != "none") {
                    uploadParams.ACL = config.s3ACL;
                }

                const upload = new Upload({
                    client: s3,
                    params: uploadParams,
                    queueSize: concurrency,
                    partSize: partSize,
                });

                upload.on('httpUploadProgress', p => {
                    if (p.total){
                        const perc = Math.round((p.loaded / p.total) * 100);
                        if (perc % 5 == 0 && progress[filename] < perc){
                            progress[filename] = perc;
                            if (onOutput) {
                                onOutput(`Uploading ${filename}... ${progress[filename]}%`);
                                if (progress[filename] == 100){
                                    onOutput(`Finalizing ${filename} upload, this could take a bit...`);
                                }
                            }
                        }
                    }
                });

                upload.done().then(() => {
                    done();
                }).catch(err => {
                    logger.debug(err);
                    const msg = `Cannot upload file to S3: ${err.message} (${err.Code || err.name}), retrying... ${file.retries}`;
                    if (onOutput) onOutput(msg);
                    if (file.retries < MAX_RETRIES){
                        file.retries++;
                        concurrency = Math.max(1, Math.floor(concurrency * 0.66));
                        progress[filename] = 0;

                        setTimeout(() => {
                            q.push(file, errHandler);
                            done();
                        }, (2 ** file.retries) * 1000);
                    }else{
                        done(new Error(msg));
                    }
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
        });
    }
};
