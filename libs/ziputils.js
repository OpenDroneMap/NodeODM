const processRunner = require('./processRunner');
const nodeUnzip = require('node-unzip-2');
const config = require('../config');
const fs = require('fs');

module.exports = {
    unzip: function(file, outputDir, cb, noDirectories = false){
        if (config.hasUnzip){
            processRunner.unzip({
                file: file,
                destination: outputDir,
                noDirectories
            }, (err, code, _) => {
                if (err) cb(err);
                else{
                    if (code === 0) cb();
                    else cb(new Error(`Could not extract .zip file, unzip exited with code ${code}`));
                }
            });
        }else if (config.has7z){
            processRunner.sevenUnzip({
                file: file,
                destination: outputDir,
                noDirectories
            }, (err, code, _) => {
                if (err) cb(err);
                else{
                    if (code === 0) cb();
                    else cb(new Error(`Could not extract .zip file, 7z exited with code ${code}`));
                }
            });
        }else{
            fs.createReadStream(file).pipe(nodeUnzip.Extract({ path: outputDir }))
                .on('close', cb)
                .on('error', cb);
        }
    }
}