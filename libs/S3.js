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
const s3 = new AWS.S3({});

module.exports = {
    uploadToS3: function(srcFolder, endpoint, credentials, cb){
        const PARALLEL_UPLOADS = 5;

        const q = async.queue((task, callback) => {
            s3.upload({
                Bucket: 'xxx',
                Key: task.dest,
                Body: fs.createReadStream(task.src)
            }, callback);
        }, PARALLEL_UPLOADS);
          
          q.drain = function() {
              console.log('all items have been processed');
          };
          
          q.push([
              { src: 'image1.png', dest: 'images/image1.png' },
              { src: 'image2.png', dest: 'images/image2.png' },
          ]);
    }
};
