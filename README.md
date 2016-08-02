# Open Source Drone Aerial Imagery Processing
node-OpenDroneMap is a Node.js App and REST API to access [OpenDroneMap](https://github.com/OpenDroneMap/OpenDroneMap)

[http://nodeodm.masseranolabs.com](http://nodeodm.masseranolabs.com)

![Alt text](/screenshots/main.png?raw=true "Node-OpenDroneMap")

## Getting Started

For a quick taste of the application, we have setup a test environment at [http://nodeodm.masseranolabs.com](http://nodeodm.masseranolabs.com). Please note that **this is not a production environment**, and that processing on this server will be slow (you are sharing the server's resources with everyone else in the world).

If you want to do your own imagery processing, we recommend that you setup your own instance via [Docker](https://www.docker.com/).

* From the Docker Quickstart Terminal (Windows / OSX) or from the command line (Linux) type:
```
git clone https://github.com/pierotofy/node-OpenDroneMap
cd node-OpenDroneMap
docker build -t nodeodm:latest .
docker run -p 3000:3000 nodeodm:latest
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

### Run it Natively

If you are already running [OpenDroneMap](https://github.com/OpenDroneMap/OpenDroneMap) on Ubuntu natively, you can simply type:

```
sudo curl --silent --location https://deb.nodesource.com/setup_6.x | sudo bash -
sudo apt-get install -y nodejs
git clone https://github.com/pierotofy/node-OpenDroneMap
cd node-OpenDroneMap
npm install
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

### Test Images

You can find some test drone images from [OpenDroneMap's Test Data Folder](https://github.com/OpenDroneMap/OpenDroneMap/tree/master/tests/test_data/images).

## Contributing

Make a pull request to the dev branch for small contributions. For big contributions, please open a discussion first. Please use ES6 syntax while writing new Javascript code so that we can keep the code base uniform.

## Roadmap

- [X] Command line options for OpenDroneMap
- [X] GPC List support
- [ ] Autoremove Abandoned Tasks
- [ ] Continuous Integration Setup
- [ ] Documentation
- [ ] Unit Testing

## API Docs

Coming soon.
