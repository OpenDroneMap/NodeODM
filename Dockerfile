FROM opendronemap:latest
MAINTAINER Piero Toffanin

RUN apt-get update
RUN apt-get install -y nodejs
RUN mkdir /var/www
WORKDIR "/var/www"
RUN git clone https://github.com/pierotofy/node-OpenDroneMap
RUN npm install

CMD ["/usr/bin/nodejs", "/var/www/index.js"] 