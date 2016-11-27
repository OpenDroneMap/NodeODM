FROM pierotofy/opendronemap:latest
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000

USER root
RUN curl --silent --location https://deb.nodesource.com/setup_6.x | sudo bash -
RUN apt-get install -y nodejs python-gdal
RUN npm install -g nodemon

# Recompile OpenDroneMap. This is necessary as the target architecture might be different than the one from which the base image was created
WORKDIR "/code"
RUN rm -fr build && rm -fr SuperBuild/build \
    && cd SuperBuild && mkdir build && cd build && cmake .. && make -j$(nproc) \
    && cd ../.. && mkdir build && cd build && cmake .. && make -j$(nproc)


RUN mkdir /var/www

WORKDIR "/var/www"
RUN git clone https://github.com/pierotofy/node-OpenDroneMap .
RUN npm install

# Fix old version of gdal2tiles.py
RUN (cd / && patch -p0) <patches/gdal2tiles.patch

ENTRYPOINT ["/usr/bin/nodejs", "/var/www/index.js"]