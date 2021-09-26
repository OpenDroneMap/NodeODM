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
const logger = require('./logger');
const dgram = require('dgram');

module.exports = class ProgressReceiver{
    constructor(){
        const server = dgram.createSocket({type: 'udp4', reuseAddr: true});
        this.callbacks = [];

        server.on('error', (err) => {
            logger.warn(`Progress listener server error: ${err.stack}`);
            server.close();
        });

        server.on('message', (msg) => {
            const parts = String(msg).split("/");
            if (parts.length === 4){
                const cmd = parts[0];
                if (cmd === 'PGUP'){
                    let [_, pid, uuid, globalProgress] = parts;
                    globalProgress = parseFloat(globalProgress);

                    if (!isNaN(globalProgress)){
                        this.callbacks.forEach(callback => callback(uuid, globalProgress));
                    }
                }
            }
        });

        server.on('listening', () => {
            const address = server.address();
            logger.info(`Listening on ${address.address}:${address.port} UDP for progress updates`);
        });

        server.bind(6367);
    }

    addListener(callback){
        this.callbacks.push(callback);
    }
};

