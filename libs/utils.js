"use strict";
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
	}
};