#!/bin/bash

if [ -z "$NVM_DIR" ]; then
    echo "Error: NVM_DIR environment variable is not set" >&2
    exit 1
fi
if [ -z "$NODE_VERSION" ]; then
    echo "Error: NODE_VERSION environment variable is not set" >&2
    exit 1
fi

for i in {1..20}; do
    apt-get update && apt-get install -y curl gpg-agent && break
    echo "apt-get failed, retrying... ($i/20)"
    sleep 30
done

mkdir -p $NVM_DIR
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source $NVM_DIR/nvm.sh
nvm install $NODE_VERSION
nvm alias default $NODE_VERSION

for i in {1..20}; do
    apt-get install -y unzip p7zip-full && npm install -g nodemon && break
    echo "apt-get failed, retrying... ($i/20)"
    sleep 30
done

npm install --production