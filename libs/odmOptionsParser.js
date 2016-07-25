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

module.exports = {
	getOptions: function(done){
		odmRunner.getJsonOptions((err, json) => {
			if (err) done(err);
			else{
				for (let option in json){
					if (option === "-h") continue;
					let values = json[option];

					let type = "";
					let defaultValue = "";
					let help = values.help || "";
					let range = values.metavar.replace(/[<>]/g, "").trim();

					switch(values.type.trim()){
						case "<type 'int'>":
							type = "int";
							defaultValue = values['default'] !== undefined ? 
											parseInt(values['default']) :
											0;
							break;
						case "<type 'float'>":
							type = "float";
							defaultValue = values['default'] !== undefined ? 
											parseFloat(values['default']) :
											0.0;
							break;
						default:
							type = "string";
							defaultValue = values['default'].trim();
					}

					if (values['default'] === "True"){
						type = "bool";
						defaultValue = true;
					}else if (values['default'] === "False"){
						type = "bool";
						defaultValue = false;
					}



					let result = {
						type, defaultValue, range, help
					};

					console.log(values);
					console.log(result);
					console.log('-----');
				}
				done();
			}
		});
	}
};
