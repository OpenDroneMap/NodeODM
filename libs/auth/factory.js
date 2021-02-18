const NoTokenRequiredAuth = require("./NoTokenRequiredAuth");
const TokenIpAuth = require("./TokenIpAuth");
const SimpleTokenAuth = require("./SimpleTokenAuth");

module.exports = {
    fromConfig: function (config) {
        if (config.token && config.authorizedIps && config.authorizedIps.length) {
            return new TokenIpAuth(config.token, config.authorizedIps);
        } else if (config.token) {
            return new SimpleTokenAuth(config.token);
        } else {
            return new NoTokenRequiredAuth();
        }
    },
};