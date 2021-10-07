#!/usr/bin/env bash

if [ "${RENDER_GROUP_ID}" -ne 0 ]; then
    groupadd -g "${RENDER_GROUP_ID}" render
    usermod -aG render odm
fi

su - odm -c "/usr/bin/node /var/www/index.js $@"
