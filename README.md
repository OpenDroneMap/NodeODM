# NodeODM

[![Build Status](https://travis-ci.org/OpenDroneMap/NodeODM.svg?branch=master)](https://travis-ci.org/OpenDroneMap/NodeODM)

NodeODM is a [standard API specification](https://github.com/OpenDroneMap/NodeODM/blob/master/docs/index.adoc) for processing aerial images with engines such as [ODM](https://github.com/OpenDroneMap/ODM). The API is used by clients such as [WebODM](https://github.com/OpenDroneMap/WebODM), [CloudODM](https://github.com/OpenDroneMap/CloudODM) and [PyODM](https://github.com/OpenDroneMap/PyODM). This repository contains a performant, production-ready reference implementation written in NodeJS.

![image](https://user-images.githubusercontent.com/1951843/78455986-4805ab80-766f-11ea-8a79-1691e062600c.png)

## Getting Started

We recommend that you setup NodeODM using [Docker](https://www.docker.com/).

* From the Docker Quickstart Terminal (Windows / OSX) or from the command line (Linux) type:
```
docker run -p 3000:3000 opendronemap/nodeodm
```

* If you're on Windows/OSX, find the IP of your Docker machine by running this command from your Docker Quickstart Terminal:

```
docker-machine ip
```

Linux users can connect to 127.0.0.1.

* Open a Web Browser to `http://<yourDockerMachineIp>:3000`
* Load [some images](https://github.com/OpenDroneMap/ODMdata)
* Press "Start Task"
* Go for a walk :)

If the computer running NodeODM is using an old or 32bit CPU, you need to compile OpenDroneMap from sources and setup NodeODM natively. You cannot use docker. Docker images work with CPUs with 64-bit extensions, MMX, SSE, SSE2, SSE3 and SSSE3 instruction set support or higher. Seeing a `Illegal instruction` error while processing images is an indication that your CPU is too old. 

## API Docs

See the [API documentation page](https://github.com/OpenDroneMap/NodeODM/blob/master/docs/index.adoc).

Some minor breaking changes exist from version `1.x` to `2.x` of the API. See [migration notes](https://github.com/OpenDroneMap/NodeODM/blob/master/MIGRATION.md).

## Run Tasks from the Command Line

You can use [CloudODM](https://github.com/OpenDroneMap/CloudODM) to run tasks with NodeODM from the command line.

## Using an External Hard Drive

If you want to store results on a separate drive, map the `/var/www/data` folder to the location of your drive:

```bash
docker run -p 3000:3000 -v /mnt/external_hd:/var/www/data opendronemap/nodeodm
```

This can be also used to access the computation results directly from the file system.

## Using GPU Acceleration for SIFT processing inside NodeODM
Since the ODM has support [of GPU acceleration](https://github.com/OpenDroneMap/ODM#gpu-acceleration) you can use another base image for GPU processing.

To use this feature, you need to use the `opendronemap/nodeodm:gpu` docker image instead of `opendronemap/nodeodm` and you need to pass the `--gpus all` flag:
```bash
docker run -p 3000:3000 --gpus all opendronemap/nodeodm:gpu
```

The SIFT GPU implementation is OpenCL-based, so should work with most graphics card (not just NVIDIA).

If you have an NVIDIA card, you can test that docker is recognizing the GPU by running:

```
docker run --rm --gpus all nvidia/cuda:10.0-base nvidia-smi
```

If you see an output that looks like this:

```
Fri Jul 24 18:51:55 2020       
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 440.82       Driver Version: 440.82       CUDA Version: 10.2     |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
```

You're in good shape!

See https://github.com/NVIDIA/nvidia-docker and https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html#docker for information on docker/NVIDIA setup.

### Windows Bundle

NodeODM can run as a self-contained executable on Windows without the need for additional dependencies (except for [ODM](https://github.com/OpenDroneMap/ODM) which needs to be installed separately). You can download the latest `nodeodm-windows-x64.zip` bundle from the [releases](https://github.com/OpenDroneMap/NodeODM/releases) page. Extract the contents in a folder and run:

```bash
nodeodm.exe --odm_path c:\path\to\ODM
```

### Run it Natively

If you are already running [ODM](https://github.com/OpenDroneMap/ODM) on Ubuntu natively you can follow these steps:

1) Install Entwine: https://entwine.io/quickstart.html#installation
 
2) Install node.js, npm dependencies, 7zip and unzip:

```bash
sudo curl --silent --location https://deb.nodesource.com/setup_6.x | sudo bash -
sudo apt-get install -y nodejs python-gdal p7zip-full unzip
git clone https://github.com/OpenDroneMap/NodeODM
cd NodeODM
npm install
```

3) Start NodeODM

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

NodeODM is meant to be a lightweight API. If you are looking for a more comprehensive solution to drone mapping, check out [WebODM](https://github.com/OpenDroneMap/WebODM), which uses NodeODM for processing.

## Contributing

Make a pull request for small contributions. For big contributions, please open a discussion first. Please use ES6 syntax while writing new Javascript code so that we can keep the code base uniform.

## Roadmap

See the [list of wanted features](https://github.com/OpenDroneMap/NodeODM/issues?q=is%3Aopen+is%3Aissue+label%3A%22new+feature%22).
