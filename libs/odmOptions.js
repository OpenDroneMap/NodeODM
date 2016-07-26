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

let options = null;

module.exports = {
	getOptions: function(done){
		if (options){
			done(null, options);
			return;
		}

		odmRunner.getJsonOptions((err, json) => {
			if (err) done(err);
			else{
				options = {};
				for (let option in json){
					// Not all options are useful to the end user
					// (num cores can be set programmatically, so can gcpFile, etc.)
					if (["-h", "--project-path", 
						"--zip-results", "--pmvs-num-cores", "--odm_georeferencing-useGcp",
						"--start-with", "--odm_georeferencing-gcpFile", "--end-with"].indexOf(option) !== -1) continue;

					let values = json[option];
					option = option.replace(/^--/, "");

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

					help = help.replace(/\%\(default\)s/g, value);

					options[option] = {
						type, value, domain, help
					};
				}
				done(null, options);
			}
		});
	},

	// Checks that the options (as received from the rest endpoint)
	// Are valid and within proper ranges.
	// The result of filtering is passed back via callback
	// @param options[]
	filterOptions: function(options, done){
		try{
			if (typeof options === "string") options = JSON.parse(options);

			// TODO: range checks, filtering

			done(null, options);
		}catch(e){
			done(e);
		}
	}
};
