FROM opendronemap/opendronemap:latest
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

# Fix old version of gdal2tiles.py
RUN (cd / && patch -p0) <patches/gdal2tiles.patch

ENTRYPOINT ["/usr/bin/nodejs", "/var/www/index.js"]