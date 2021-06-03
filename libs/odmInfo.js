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
const odmRunner = require('./odmRunner');
const config = require('../config');
const async = require('async');
const assert = require('assert');
const logger = require('./logger');

let odmOptions = null;
let odmVersion = null;
let engine = null;

module.exports = {
    initialize: function(done){
        async.parallel([
            this.getOptions,
            this.getVersion
        ], done);
    },
    
    getVersion: function(done){
        if (odmVersion){
            done(null, odmVersion);
            return;
        }

        odmRunner.getVersion((err, version) => {
            odmVersion = version;
            done(null, version);
        });
    },

    getEngine: function(done){
        if (engine){
            done(null, engine);
            return;
        }

        odmRunner.getEngine((err, eng) => {
            engine = eng;
            done(null, eng);
        });
    },

    supportsOption: function(optName, cb){
        this.getOptions((err, json) => {
            if (err) cb(err);
            else{
                cb(null, !!json.find(opt => opt.name === optName));
            }
        });
    },

    getOptions: function(done){
        if (odmOptions){
            done(null, odmOptions);
            return;
        }

        odmRunner.getJsonOptions((err, json) => {
            if (err) done(err);
            else{
                odmOptions = [];
                for (let option in json){
                    // Not all options are useful to the end user
                    // (num cores can be set programmatically, so can gcpFile, etc.)
                    if (["-h", "--project-path", "--cmvs-maxImages", "--time",
                        "--zip-results", "--pmvs-num-cores",
                        "--start-with", "--gcp", "--images", "--geo",
                        "--split-image-groups", "--copy-to",
                        "--rerun-all", "--rerun",
                        "--slam-config", "--video", "--version", "name"].indexOf(option) !== -1) continue;

                    let values = json[option];

                    let name = option.replace(/^--/, "");
                    let type = "";
                    let value = "";
                    let help = values.help || "";
                    let domain = values.metavar !== undefined ? 
                                 values.metavar.replace(/^[<>]/g, "")
                                                .replace(/[<>]$/g, "")
                                                .trim() : 
                                 "";

                    switch((values.type || "").trim()){
                        case "<type 'int'>":
                        case "<class 'int'>":
                            type = "int";
                            value = values['default'] !== undefined ? 
                                            parseInt(values['default']) :
                                            0;
                            break;
                        case "<type 'float'>":
                        case "<class 'float'>":
                            type = "float";
                            value = values['default'] !== undefined ? 
                                            parseFloat(values['default']) :
                                            0.0;
                            break;
                        default:
                            type = "string";
                            value = values['default'] !== undefined ? 
                                    values['default'].trim() :
                                    "";
                    }

                    if (values['default'] === "True"){
                        type = "bool";
                        value = true;
                    }else if (values['default'] === "False"){
                        type = "bool";
                        value = false;
                    }

                    // If 'choices' is specified, try to convert it to array
                    if (values.choices){
                        try{
                            values.choices = JSON.parse(values.choices.replace(/'/g, '"')); // Convert ' to "
                        }catch(e){
                            logger.warn(`Cannot parse choices: ${values.choices}`);
                        }	
                    }

                    // In the end, all values must be converted back
                    // to strings (per OpenAPI spec which doesn't allow mixed types)
                    value = String(value);

                    if (Array.isArray(values.choices)){
                        type = "enum";
                        domain = values.choices;

                        // Make sure that the default value
                        // is in the list of choices
                        if (domain.indexOf(value) === -1) domain.unshift(value);
                    }
                    
                    odmOptions.push({
                        name, type, value, domain, help
                    });
                }
                done(null, odmOptions);
            }
        });
    },

    // Checks that the options (as received from the rest endpoint)
    // Are valid and within proper ranges.
    // The result of filtering is passed back via callback
    // @param options[]
    filterOptions: function(options, done){
        assert(odmOptions !== null, "odmOptions is not set. Have you initialized odmOptions properly?");

        try{
            if (typeof options === "string") options = JSON.parse(options);
            if (!Array.isArray(options)) options = [];
            
            let result = [];
            let errors = [];
            let addError = function(opt, descr){
                errors.push({
                    name: opt.name,
                    error: descr
                });
            };

            let typeConversion = {
                'float': Number.parseFloat,
                'int': Number.parseInt,
                'bool': function(value){
                    if (value === 'true' || value === '1') return true;
                    else if (value === 'false' || value === '0') return false;
                    else if (typeof value === 'boolean') return value;
                    else throw new Error(`Cannot convert ${value} to boolean`);
                },
                'string': function(value){
                    return value; // No conversion needed
                },
                'path': function(value){
                    return value; // No conversion needed
                },
                'enum': function(value){
                    return value; // No conversion needed
                }
            };
            
            let domainChecks = [
                {
                    regex: /^(positive |negative )?(integer|float)$/, 
                    validate: function(matches, value){
                        if (matches[1] === 'positive ') return value >= 0;
                        else if (matches[1] === 'negative ') return value <= 0;
                        
                        else if (matches[2] === 'integer') return Number.isInteger(value);
                        else if (matches[2] === 'float') return Number.isFinite(value);
                    }
                },
                {
                    regex: /^percent$/,
                    validate: function(matches, value){
                        return value >= 0 && value <= 100;
                    }
                },
                {
                    regex: /^(float|integer): ([\-\+\.\d]+) <= x <= ([\-\+\.\d]+)$/,
                    validate: function(matches, value){
                        let [str, type, lower, upper] = matches;
                        let parseFunc = type === 'float' ? parseFloat : parseInt;
                        lower = parseFunc(lower);
                        upper = parseFunc(upper);
                        return value >= lower && value <= upper;						
                    }
                },
                {
                    regex: /^(float|integer) (>=|>|<|<=) ([\-\+\.\d]+)$/,
                    validate: function(matches, value){
                        let [str, type, oper, bound] = matches;
                        let parseFunc = type === 'float' ? parseFloat : parseInt;
                        bound = parseFunc(bound);
                        switch(oper){
                            case '>=':
                                return value >= bound;
                            case '>':
                                return value > bound;
                            case '<=':
                                return value <= bound;
                            case '<':
                                return value < bound;
                            default:
                                return false;
                        }
                    }
                },
                {
                    regex: /^(json)$/,
                    validate: function(matches, value){
                        try{
                            if (typeof value !== 'string') return false;
                            JSON.parse(value);
                            return true;
                        }catch(e){
                            return false;
                        }
                    }
                },
                {
                    regex: /^(string|path)$/,
                    validate: function(){
                        return true; // All strings/paths are fine
                    }
                }
            ];

            let checkDomain = function(domain, value){
                if (Array.isArray(domain)){
                    // Special case for enum checks
                    if (domain.indexOf(value) === -1) throw new Error(`Invalid value ${value} (not in enum)`);
                }else{
                    let matches,
                        dc = domainChecks.find(dc => matches = domain.match(dc.regex));

                    if (dc){
                        if (!dc.validate(matches, value)) throw new Error(`Invalid value ${value} (out of range)`);
                    }else{
                        throw new Error(`Domain value cannot be handled: '${domain}' : '${value}'`);
                    }
                }
            };

            // Scan through all possible options
            let maxConcurrencyFound = false;
            let maxConcurrencyIsAnOption = false;

            for (let odmOption of odmOptions){
                if (odmOption.name === 'max-concurrency') maxConcurrencyIsAnOption = true;
                
                // Was this option selected by the user?
                /*jshint loopfunc: true */
                let opt = options.find(o => o.name === odmOption.name);
                if (opt){
                    try{
                        // Convert to proper data type

                        let value = typeConversion[odmOption.type](opt.value);

                        // Domain check
                        if (odmOption.domain){
                            checkDomain(odmOption.domain, value);
                        }
                        
                        // Max concurrency check
                        if (opt.name === 'max-concurrency'){
                            maxConcurrencyFound = true;

                            // Cap
                            if (config.maxConcurrency){
                                value = Math.min(value, config.maxConcurrency);
                            }
                        }

                        result.push({
                            name: odmOption.name,
                            value: value
                        });
                    }catch(e){
                        addError(opt, e.message);						
                    }
                }
            }

            // If no max concurrency was passed by the user
            // but our configuration sets a limit, pass it.
            if (!maxConcurrencyFound && maxConcurrencyIsAnOption && config.maxConcurrency){
                result.push({
                    name: "max-concurrency",
                    value: config.maxConcurrency
                });
            }

            if (errors.length > 0) done(new Error(JSON.stringify(errors)));
            else done(null, result);
        }catch(e){
            done(e);
        }
    }
};