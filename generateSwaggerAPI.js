var swaggerJSDoc = require('swagger-jsdoc');
var jsonfile = require('jsonfile');

var options = {
  swaggerDefinition: {
    info: {
      title: 'Node-OpenDroneMap', // Title (required)
      version: '0.1.0', // Version (required)
    },
  },
  apis: ['./index.js'], // Path to the API docs
};

// Initialize swagger-jsdoc -> returns validated swagger spec in json format
var swaggerSpec = swaggerJSDoc(options);

var file = 'swagger-api.json';

jsonfile.writeFile(file, swaggerSpec, function (err) {
  console.error(err);
  process.exit(1);
});
