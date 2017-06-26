# Node-OpenDroneMap

[![Build Status](https://travis-ci.org/OpenDroneMap/node-OpenDroneMap.svg?branch=master)](https://travis-ci.org/OpenDroneMap/node-OpenDroneMap)

node-OpenDroneMap is a Node.js App and REST API to access [OpenDroneMap](https://github.com/OpenDroneMap/OpenDroneMap). It exposes an API which is used by [WebODM](https://github.com/OpenDroneMap/WebODM).

![Alt text](/screenshots/main.png?raw=true "Node-OpenDroneMap")

## Getting Started

For a quick taste of the application, we have setup a test environment at [http://nodeodm.masseranolabs.com](http://nodeodm.masseranolabs.com). Please note that **this is not a production environment**, and that processing on this server will be slow (you are sharing the server's resources with everyone else in the world).

If you want to do your own imagery processing, we recommend that you setup your own instance via [Docker](https://www.docker.com/).

* From the Docker Quickstart Terminal (Windows / OSX) or from the command line (Linux) type:
```
docker run -p 3000:3000 opendronemap/node-opendronemap
```

* If you're on Windows/OSX, find the IP of your Docker machine by running this command from your Docker Quickstart Terminal:

```
docker-machine ip
```

Linux users can connect to 127.0.0.1.

* Open a Web Browser to `http://<yourDockerMachineIp>:3000`
* Load [some images](https://github.com/OpenDroneMap/OpenDroneMap/tree/master/tests/test_data/images)
* Press "Start Task"
* Go for a walk :)

## API Docs

See the [API documentation page](/docs/index.adoc).

### Run it Natively

If you are already running [OpenDroneMap](https://github.com/OpenDroneMap/OpenDroneMap) on Ubuntu natively you can follow these steps:

1) Install PotreeConverter and LASzip dependency
 
```bash
apt-get install -y libboost-dev libboost-program-options-dev

mkdir /staging
git clone https://github.com/pierotofy/LAStools /staging/LAStools
cd LAStools/LASzip
mkdir build
cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
sudo make && sudo make install
sudo ldconfig

git clone https://github.com/pierotofy/PotreeConverter /staging/PotreeConverter
cd /staging/PotreeConverter
mkdir build
cd build
cmake -DCMAKE_BUILD_TYPE=Release -DLASZIP_INCLUDE_DIRS=/staging/LAStools/LASzip/dll -DLASZIP_LIBRARY=/staging/LAStools/LASzip/build/src/liblaszip.so ..
sudo make && sudo make install
```
2) Install gdal2tiles.py script, node.js and npm dependencies

```bash
sudo curl --silent --location https://deb.nodesource.com/setup_6.x | sudo bash -
sudo apt-get install -y nodejs python-gdal
git clone https://github.com/pierotofy/node-OpenDroneMap
cd node-OpenDroneMap
npm install
```

3) Start node-OpenDroneMap

```bash
node index.js
```

You may need to specify your ODM project path to start the server:

```
node index.js --odm_path /home/username/OpenDroneMap
```

If you want to start node ODM on a different port you can do the following:

```
node index.js --port 8000 --odm_path /home/username/OpenDroneMap
```

For other command line options you can run:

```
node index.js --help
```

You can also specify configuration values via a JSON file:

```
node index.js --config config.default.json
```

Command line arguments always take precedence over the configuration file.

### Run it using PM2

The app can also be run as a background process using the [pm2 process manager](https://github.com/Unitech/pm2), which can also assist you with system startup scripts and process monitoring.

To install pm2, run (using `sudo` if required):
```shell
npm install pm2 -g
```
The app can then be started using
```shell
pm2 start processes.json
```
To have pm2 started on OS startup run
```shell
pm2 save
pm2 startup
```
and then run the command as per the instructions that prints out. If that command errors then you may have to specify the system (note that systemd should be used on CentOS 7). Note that if the process is not running as root (recommended) you will need to change `/etc/init.d/pm2-init.sh` to set `export PM2_HOME="/path/to/user/home/.pm2"`, as per [these instructions](
http://www.buildsucceeded.com/2015/solved-pm2-startup-at-boot-time-centos-7-red-hat-linux/)

You can monitor the process using `pm2 status`.

### Test Mode

If you want to make a contribution, but don't want to setup OpenDroneMap, or perhaps you are working on a Windows machine, or if you want to run automated tests, you can turn test mode on:

```
node index.js --test
```

While in test mode all calls to OpenDroneMap's code will be simulated (see the /tests directory for the mock data that is returned).

### Test Images

You can find some test drone images [here](https://github.com/dakotabenjamin/odm_data).

## What if I need more functionality?

node-OpenDroneMap is meant to be a lightweight API. If you are looking for a more comprehensive solution to drone mapping, check out [WebODM](https://github.com/OpenDroneMap/WebODM), which uses node-OpenDroneMap for processing.

## Contributing

Make a pull request for small contributions. For big contributions, please open a discussion first. Please use ES6 syntax while writing new Javascript code so that we can keep the code base uniform.

## Roadmap

- [X] Command line options for OpenDroneMap
- [X] GPC List support
- [ ] Video support when the [SLAM module](https://github.com/OpenDroneMap/OpenDroneMap/pull/317) becomes available
- [ ] Continuous Integration Setup
- [X] Documentation
- [ ] Unit Testing
