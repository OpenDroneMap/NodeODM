# node-OpenDroneMap
Node.js App and REST API to access [OpenDroneMap](https://github.com/OpenDroneMap/OpenDroneMap)

![Alt text](/screenshots/main.png?raw=true "Node-OpenDroneMap")

## Getting Started

The quickest way is to use [Docker](https://www.docker.com/).

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

And you're done!

### Run it Natively

If you are already running [OpenDroneMap](https://github.com/OpenDroneMap/OpenDroneMap) on Ubuntu natively, you can simply type:

```
sudo curl --silent --location https://deb.nodesource.com/setup_6.x | sudo bash -
sudo apt-get install -y nodejs
git clone https://github.com/pierotofy/node-OpenDroneMap
cd node-OpenDroneMap
node index.js
```

## Contributing

Make a pull request for small contributions. For big contributions, please open a discussion first.

## Roadmap

- [ ] Command line options for OpenDroneMap (in progress)
- [ ] Cluster tasks distribution to multiple servers (planned)
- [ ] Documentation (planned)

## API Docs

Coming soon.
