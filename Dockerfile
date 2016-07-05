FROM opendronemap/opendronemap:latest
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000

USER root
RUN curl --silent --location https://deb.nodesource.com/setup_5.x | sudo bash -
RUN apt-get install -y nodejs

RUN mkdir /var/www
RUN chown odm:odm /var/www

USER odm
WORKDIR "/var/www"
RUN git clone https://github.com/pierotofy/node-OpenDroneMap .
RUN npm install

ENTRYPOINT ["/usr/bin/nodejs", "/var/www/index.js"]