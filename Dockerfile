FROM opendronemap/odm:latest
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000

USER root
RUN curl --silent --location https://deb.nodesource.com/setup_10.x | bash -
RUN apt-get install -y nodejs python-gdal p7zip-full && npm install -g nodemon && \
    ln -s /code/SuperBuild/install/bin/entwine /usr/bin/entwine && \
    ln -s /code/SuperBuild/install/bin/pdal /usr/bin/pdal


RUN mkdir /var/www

WORKDIR "/var/www"
COPY . /var/www

RUN npm install && mkdir tmp

# Temporary fix to cryptography warning
RUN pip install cryptography==2.9.2

ENTRYPOINT ["/usr/bin/nodejs", "/var/www/index.js"]
