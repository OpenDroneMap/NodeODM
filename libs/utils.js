"use strict";

const path = require('path');
const os = require('os');
const crypto = require('crypto');

module.exports = {
    get: function(scope, prop, defaultValue){
        let parts = prop.split(".");
        let current = scope;
        for (let i = 0; i < parts.length; i++){
            if (current[parts[i]] !== undefined && i < parts.length - 1){
                current = current[parts[i]];
            }else if (current[parts[i]] !== undefined && i < parts.length){
                return current[parts[i]];
            }else{
                return defaultValue;
            }
        }	
        return defaultValue;
    },

    sanitize: function(filePath){
        filePath = filePath.replace(/[^\w.-]/g, "_");
        return filePath;
    },

    parseUnsafePathsList: function(paths){
        // Parse a list (or a JSON encoded string representing a list)
        // of paths and remove all traversals (., ..) and guarantee
        // that the paths are relative

        if (typeof paths === "string"){
            try{
                paths = JSON.parse(paths);
            }catch(e){
                return [];
            }
        }
        
        if (!Array.isArray(paths)){
            return [];
        }
        
        return paths.map(p => {
            const safeSuffix = path.normalize(p).replace(/^(\.\.(\/|\\|$))+/, '');
            return path.join('./', safeSuffix);
        });
    },

    clone: function(json){
        return JSON.parse(JSON.stringify(json));
    },

    tmpPath: function(extension = ".txt"){
        return path.join(os.tmpdir(), `nodeodm_${crypto.randomBytes(6).readUIntLE(0,6).toString(36)}${extension}`);
    }
};