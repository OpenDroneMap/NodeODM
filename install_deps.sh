#!/bin/bash

for i in {1..20}; do
    apt-get update && apt-get install -y curl gpg-agent && break
    echo "apt-get failed, retrying... ($i/20)"
    sleep 30
done

curl --silent --location https://deb.nodesource.com/setup_14.x | bash -

for i in {1..20}; do
    apt-get install -y nodejs npm unzip p7zip-full && npm install -g nodemon && break
    echo "apt-get failed, retrying... ($i/20)"
    sleep 30
done