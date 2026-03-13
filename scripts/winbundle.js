const fs = require('fs');
const spawnSync = require('child_process').spawnSync;
const path = require('path');
const request = require('request');
const async = require('async');
const nodeUnzip = require('node-unzip-2');
const archiver = require('archiver');
const os = require('os');

const bundleName = "nodeodm-windows-x64.zip";

const scratch = 'RUNNER_TEMP' in process.env ? process.env.RUNNER_TEMP : os.tmpdir();

const download = function(uri, filename, callback) {
    console.log(`Downloading ${uri}`);
    request.head(uri, function(err, res, body) {
        if (err) callback(err);
        else{
            request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
        }
    });
};

function downloadApp(destFolder, appUrl, cb){
    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
    else {
        cb();
        return;
    }

    let zipPath = path.join(destFolder, "download.zip");
    let _called = false;

    const done = (err) => {
        if (!_called){ // Bug in nodeUnzip, makes this get called twice
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            _called = true; 
            cb(err);
        }
    };
    download(appUrl, zipPath, err => {
        if (err) done(err);
        else{
            // Unzip
            console.log(`Extracting ${zipPath}`);
            fs.createReadStream(zipPath).pipe(nodeUnzip.Extract({ path: destFolder }))
                .on('close', done)
                .on('error', done);
        }
    });
}

async.series([
    cb => {
        // Cleanup directories
        console.log("Cleaning up folders");
        for (let dir of ["data", "tmp"]){
            for (let entry of fs.readdirSync(dir)){
                if (entry !== ".gitignore"){
                    console.log(`Removing ${dir}/${entry}`);
                    fs.rmdirSync(path.join(dir, entry), { recursive: true });
                }
            }
        }
        cb();
    },

    cb => {
        downloadApp(path.join("apps", "7z"), "https://github.com/OpenDroneMap/NodeODM/releases/download/v2.1.0/7z19.zip", cb);
    },
    cb => {
        downloadApp(path.join("apps", "unzip"), "https://github.com/OpenDroneMap/NodeODM/releases/download/v2.1.0/unzip600.zip", cb);
    },
    cb => {
        downloadApp(path.join(scratch, "azuresigning"), "https://www.nuget.org/api/v2/package/Microsoft.ArtifactSigning.Client/1.0.115", cb);
    },
    cb => {
        console.log("Building executable");
        const code = spawnSync('nexe.cmd', ['index.js', '-t', 'windows-x64-12.16.3', '-o', 'nodeodm.exe'], { stdio: "inherit", shell: true }).status;

        if (code === 0) cb();
        else cb(new Error(`nexe returned non-zero error code: ${code}`));
    },
    cb => {
        let signtoolPath = null;
        let metadataPath = null;

        const signtoolPathArgIndex = process.argv.indexOf("--signtool-path");
        if (signtoolPathArgIndex !== -1 && signtoolPathArgIndex + 1 < process.argv.length) {
            signtoolPath = process.argv[signtoolPathArgIndex + 1];
        }

        const metadataPathArgIndex = process.argv.indexOf("--azure-signing-metadata");
        if (metadataPathArgIndex !== -1 && metadataPathArgIndex + 1 < process.argv.length) {
            metadataPath = process.argv[metadataPathArgIndex + 1];
        }

        if (signtoolPath && metadataPath) {
            console.log("Signing executable");

            const dlibPath = path.join(scratch, "azuresigning", "bin", "x64", "Azure.CodeSigning.Dlib.dll");
            const code = spawnSync(signtoolPath, ['sign', '/v', '/debug', '/fd', 'SHA256', '/tr', 'http://timestamp.acs.microsoft.com', '/td', 'SHA256', '/dlib', dlibPath, '/dmdf', metadataPath, 'nodeodm.exe'], { stdio: "inherit" }).status;

            if (code === 0) cb();
            else cb(new Error(`signtool returned non-zero error code: ${code}`));
        } else {
            cb();
        }
    },
    cb => {
        // Zip
        const outFile = path.join("dist", bundleName);
        if (!fs.existsSync("dist")) fs.mkdirSync("dist");
        if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

        let output = fs.createWriteStream(outFile);
        let archive = archiver.create('zip', {
            zlib: { level: 5 } // Sets the compression level (1 = best speed since most assets are already compressed)
        });

        archive.on('finish', () => {
            console.log("Done!");
            cb();
        });

        archive.on('error', err => {
            console.error(`Could not archive .zip file: ${err.message}`);
            cb(err);
        });

        const files = [
            "apps",
            "data",
            "helpers",
            "public",
            "scripts",
            "tests",
            "tmp",
            "config-default.json",
            "LICENSE",
            "SOURCE",
            "package.json",
            "nodeodm.exe"
        ];

        archive.pipe(output);
        files.forEach(file => {
            console.log(`Adding ${file}`);
            let stat = fs.lstatSync(file);
            if (stat.isFile()){
                archive.file(file, {name: path.basename(file)});
            }else if (stat.isDirectory()){
                archive.directory(file, path.basename(file));
            }else{
                logger.error(`Could not add ${file}`);
            }
        });

        archive.finalize();
    }
], (err) => {
    if (err) console.log(`Bundle failed: ${err}`);
    else console.log(`Bundle ==> dist/${bundleName}`);
});


