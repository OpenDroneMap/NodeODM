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
let odmRunner = require('./odmRunner');
let assert = require('assert');
let logger = require('./logger');

let odmOptions = null;

module.exports = {
	initialize: function(done){
		this.getOptions(done);
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
						"--start-with", "--gcp", "--end-with", "--images", 
						"--slam-config", "--video", "--version", "--name"].indexOf(option) !== -1) continue;

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
							type = "int";
							value = values['default'] !== undefined ? 
											parseInt(values['default']) :
											0;
							break;
						case "<type 'float'>":
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

					if (Array.isArray(values.choices)){
						type = "enum";
						domain = values.choices;
					}

					help = help.replace(/\%\(default\)s/g, value);

                    // In the end, all values must be converted back
                    // to strings (per OpenAPI spec which doesn't allow mixed types)
                    value = String(value);

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
					if (value === 'true') return true;
					else if (value === 'false') return false;
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
					regex: /^(float): ([\-\+\.\d]+) <= x <= ([\-\+\.\d]+)$/,
					validate: function(matches, value){
						let [str, type, lower, upper] = matches;
						lower = parseFloat(lower);
						upper = parseFloat(upper);
						return value >= lower && value <= upper;						
					}
				},
				{
					regex: /^(float) (>=|>|<|<=) ([\-\+\.\d]+)$/,
					validate: function(matches, value){
						let [str, type, oper, bound] = matches;
						bound = parseFloat(bound);
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
			for (let odmOption of odmOptions){
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

						result.push({
							name: odmOption.name,
							value: value
						});
					}catch(e){
						addError(opt, e.message);						
					}
				}
			}

			if (errors.length > 0) done(new Error(JSON.stringify(errors)));
			else done(null, result);
		}catch(e){
			done(e);
		}
	}
};