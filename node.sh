#!/bin/bash

if [ -z "$NVM_DIR" ]; then
    echo "Error: NVM_DIR environment variable is not set" >&2
    exit 1
fi

source $NVM_DIR/nvm.sh
nvm use $NODE_VERSION
exec node "$@"