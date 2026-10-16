# NodeODX

![CPU Build](https://img.shields.io/github/actions/workflow/status/WebODM/NodeODX/publish-docker.yml?branch=master&label=docker%20CPU) ![GPU Build](https://img.shields.io/github/actions/workflow/status/WebODM/NodeODX/publish-docker-gpu.yml?branch=master&label=docker%20GPU) ![Windows Build](https://img.shields.io/github/actions/workflow/status/WebODM/NodeODX/publish-windows.yml?branch=master&label=windows) ![Version](https://img.shields.io/github/v/release/WebODM/NodeODX) ![License](https://img.shields.io/github/license/WebODM/NodeODX) ![Contributors](https://img.shields.io/github/contributors/WebODM/NodeODX) ![Updated](https://img.shields.io/github/last-commit/WebODM/NodeODX)

> **📢 Now with upgraded AWS SDK!** [Read the announcement](https://webodm.org/blog/announcement/)


NodeODX is a [standard API specification](https://github.com/WebODM/NodeODX/blob/master/docs/index.adoc) for processing aerial images with engines such as [ODX](https://github.com/WebODM/ODX). The API is used by clients such as [WebODM](https://github.com/WebODM/WebODM), [CloudODX](https://github.com/WebODM/CloudODX) and [PyODX](https://github.com/WebODM/PyODX). This repository contains a performant, production-ready reference implementation written in NodeJS.

<img width="915" height="254" alt="image" src="https://github.com/user-attachments/assets/3754a3b3-ba8c-4957-b2c6-59bc1bcafb8a" />

## Getting Started

We recommend that you setup NodeODX using [Docker](https://www.docker.com/).

* From a command prompt / terminal type:
```
docker run -p 3000:3000 webodm/nodeodx
```

Linux users can connect to 127.0.0.1.

* Open a Web Browser to `http://127.0.0.1:3000`
* Load [some images](https://webodm.org/datasets)
* Press "Start Task"
* Go for a walk :)

If the computer running NodeODX is using an old or 32bit CPU, you need to compile ODX from sources and setup NodeODX natively. You cannot use docker. Docker images work with CPUs with 64-bit extensions, MMX, SSE, SSE2, SSE3 and SSSE3 instruction set support or higher. Seeing a `Illegal instruction` error while processing images is an indication that your CPU is too old. 

### Building docker image

If you need to test changes as a docker image, you can build easily as follows:

```
docker build -t my_nodeodx_image --no-cache .
```

Run as follows:

```
docker run -p 3000:3000 mynodeodx &
```


### Testing alternative ODX images through NodeODX

In order to test alternative docker images in NodeODX, you will need to change the dockerfile for NodeODX to point to your ODX image. For example if you built an alternate ODX image as follows:

```
docker build -t my_odx_image --no-cache .
```

Then modify NodeODX's Dockerfile to point to the new ODX image in the first line:

```
FROM my_odx_image
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000
...
```

Then build the NodeODX image:

```
docker build -t my_nodeodx_image --no-cache .
```

Finally run as follows:

```
docker run -p 3000:3000 my_nodeodx_image &
```

### Running rootless

* A rootless alternative to Docker is using [Apptainer](https://apptainer.org/). In order to run NodeODX together with ClusterODX in rootless environments, for example on HPC, we need a rootless alternative to Docker, and that's where Apptainer comes in to play. From the Linux command line, cd into the NodeODX folder and run the following commands to host a NodeODX instance:

```
apptainer build --sandbox node/ apptainer.def
apptainer run --writable node/ 
```

`apptainer build --sandbox` requires you to have root permission to build this apptainer container. Make sure someone with root permission build this for you. You will need to build this apptainer container if you want to work with ClusterODX on the HPC. Check for [ClusterODX](https://github.com/WebODM/ClusterODX) for more instructions on using SLURM to set it up.

An apptainer.def file can be built directly from the dockerfile as needed:

```
pip3 install spython
spython recipe Dockerfile &> apptainer.def
```

## API Docs

See the [API documentation page](https://github.com/WebODM/NodeODX/blob/master/docs/index.adoc).

Some minor breaking changes exist from version `1.x` to `2.x` of the API. See [migration notes](https://github.com/WebODM/NodeODX/blob/master/MIGRATION.md).

## Run Tasks from the Command Line

You can use [CloudODX](https://github.com/WebODM/CloudODX) to run tasks with NodeODX from the command line.

## Using an External Hard Drive

If you want to store results on a separate drive, map the `/var/www/data` folder to the location of your drive:

```bash
docker run -p 3000:3000 -v /mnt/external_hd:/var/www/data webodm/nodeodx
```

This can be also used to access the computation results directly from the file system.

## Using GPU Acceleration

Since ODX has support [for GPU acceleration](https://github.com/https://github.com/WebODM/ODX#gpu-acceleration) you can use another base image for GPU processing. You need to use the `webodm/nodeodx:gpu` docker image instead of `webodm/nodeodx` and you need to pass the `--gpus all` flag:

```bash
docker run -p 3000:3000 --gpus all webodm/nodeodx:gpu
```

The GPU implementation is CUDA-based, so will only work on NVIDIA GPUs.

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

NodeODX can run as a self-contained executable on Windows without the need for additional dependencies (except for [ODX](https://github.com/https://github.com/WebODM/ODX) which needs to be installed separately). You can download the latest `nodeodx-windows-x64.zip` bundle from the [releases](https://github.com/WebODM/NodeODX/releases) page. Extract the contents in a folder and run:

```bash
nodeodx.exe --odx_path c:\path\to\ODX
```

### Run it Natively

If you are already running [ODX](https://github.com/https://github.com/WebODM/ODX) on Ubuntu natively you can follow these steps:

1) Install Entwine: https://entwine.io/quickstart.html#installation
 
2) Install node.js, npm dependencies, 7zip and unzip:

```bash
sudo curl --silent --location https://deb.nodesource.com/setup_6.x | sudo bash -
sudo apt-get install -y nodejs python-gdal p7zip-full unzip
git clone https://github.com/WebODM/NodeODX
cd NodeODX
npm install
```

3) Start NodeODX

```bash
node index.js
```

You may need to specify your ODX project path to start the server:

```
node index.js --odx_path /home/username/ODX
```

If you want to start node ODX on a different port you can do the following:

```
node index.js --port 8000 --odx_path /home/username/ODX
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

If you want to make a contribution, but don't want to setup ODX, or perhaps you are working on a Windows machine, or if you want to run automated tests, you can turn test mode on:

```
node index.js --test
```

While in test mode all calls to ODX code will be simulated (see the /tests directory for the mock data that is returned).

### Test Images

You can find some test drone images [here](https://github.com/dakotabenjamin/odm_data).

## What if I need more functionality?

NodeODX is meant to be a lightweight API. If you are looking for a more comprehensive solution to drone mapping, check out [WebODM](https://github.com/WebODM/WebODM), which uses NodeODX for processing.

## Contributing

Make a pull request for small contributions. For big contributions, please open a discussion first. Please use ES6 syntax while writing new Javascript code so that we can keep the code base uniform.

