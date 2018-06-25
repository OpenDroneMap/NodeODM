/* 
Node-OpenDroneMap Node.js App and REST API to access OpenDroneMap. 
Copyright (C) 2018 Node-OpenDroneMap Contributors

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
let logger = require('../logger');

module.exports = /*abstract */ class TokenAuthBase{
    initialize(cb){
        logger.info(`Authentication using ${this.constructor.name.replace(/Auth$/, "")}`);
        cb();
    }

    cleanup(cb){
        cb();
    }
    
    validateToken(token, cb){ cb(new Error("Not implemented"), false); }

    getMiddleware(){
        return (req, res, next) => {
            this.validateToken(req.query.token, (err, valid) => {
                if (valid) next();
                else{
                    res.json({ error: "Invalid authentication token: " + err.message });
                }
            });
        };
    }
};