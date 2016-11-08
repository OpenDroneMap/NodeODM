FROM pierotofy/opendronemap:dev
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000

USER root
RUN curl --silent --location https://deb.nodesource.com/setup_6.x | sudo bash -
RUN apt-get install -y nodejs python-gdal
RUN npm install -g nodemon

RUN mkdir /var/www

WORKDIR "/var/www"
RUN git clone https://github.com/pierotofy/node-OpenDroneMap .
RUN npm install

ENTRYPOINT ["/usr/bin/nodejs", "/var/www/index.js"]