FROM opendronemap/odm:latest
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000

USER root

RUN mkdir /var/www

WORKDIR "/var/www"
COPY . /var/www

ENV NVM_DIR /usr/local/nvm
ENV NODE_VERSION 14

RUN bash install_deps.sh && \
    ln -s /code/SuperBuild/install/bin/untwine /usr/bin/untwine && \
    ln -s /code/SuperBuild/install/bin/entwine /usr/bin/entwine && \
    ln -s /code/SuperBuild/install/bin/pdal /usr/bin/pdal && \
    ln -s /var/www/node.sh /usr/bin/node && \
    mkdir -p tmp && node index.js --powercycle

ENTRYPOINT ["/usr/bin/node", "/var/www/index.js"]
