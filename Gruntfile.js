module.exports = function(grunt) {

	require('time-grunt')(grunt);

	grunt.initConfig({
		jshint: {
			options: {
				jshintrc: ".jshintrc"
		    },
			all: ['Gruntfile.js', 'libs/**/*.js', 'docs/**/*.js', 'index.js', 'config.js']
		}
	});

	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.registerTask('default', ['jshint']);
};