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
const TokenAuthBase = require("./TokenAuthBase");

module.exports = class TokenIpAuth extends TokenAuthBase {
    // @param token {String} token to use for authentication
    constructor(token, ips = []) {
        // TODO get authorized ip's from config during initialization
        super(token);

        this.token = token;
        this.ips = ips;
    }

    validateToken(token, cb) {
        if (this.token === token) {
            return cb(null, true);
        } else {
            cb(new Error("token does not match."), false);
        }
    }

    getMiddleware() {
        return (req, res, next) => {
            // TODO check ip from req here
            this.validateToken(req.query.token, (err, valid) => {
                if (valid) next();
                else {
                    res.json({
                        error: "Invalid authentication token: " + err.message,
                    });
                }
            });
        };
    }
};
