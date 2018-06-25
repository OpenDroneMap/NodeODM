const NoTokenRequiredAuth = require('./NoTokenRequiredAuth');
const SimpleTokenAuth = require('./SimpleTokenAuth');

module.exports = {
    fromConfig: function(config){
        if (config.token){
            return new SimpleTokenAuth(config.token);
        }else{
            return new NoTokenRequiredAuth();
        }
    }
}