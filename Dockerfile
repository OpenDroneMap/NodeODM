FROM opendronemap/opendronemap:latest
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000

USER root
RUN curl --silent --location https://deb.nodesource.com/setup_6.x | sudo bash -
RUN apt-get install -y nodejs python-gdal libboost-dev libboost-program-options-dev
RUN npm install -g nodemon

# Build LASzip and PotreeConverter
WORKDIR "/staging"
RUN git clone https://github.com/pierotofy/LAStools /staging/LAStools && \
	cd LAStools/LASzip && \
	mkdir build && \
	cd build && \
	cmake -DCMAKE_BUILD_TYPE=Release .. && \
	make && \
	make install && \
	ldconfig

RUN git clone https://github.com/pierotofy/PotreeConverter /staging/PotreeConverter
RUN cd /staging/PotreeConverter && \
	mkdir build && \
	cd build && \
	cmake -DCMAKE_BUILD_TYPE=Release -DLASZIP_INCLUDE_DIRS=/staging/LAStools/LASzip/dll -DLASZIP_LIBRARY=/staging/LAStools/LASzip/build/src/liblaszip.so .. && \
	make && \
	make install

RUN mkdir /var/www

WORKDIR "/var/www"

#RUN git clone https://github.com/OpenDroneMap/node-OpenDroneMap .

COPY . /var/www


RUN npm install
RUN mkdir tmp

# Fix old version of gdal2tiles.py
# RUN (cd / && patch -p0) <patches/gdal2tiles.patch

ENTRYPOINT ["/usr/bin/nodejs", "/var/www/index.js"]
