#!/usr/bin/env bash

if [ ! -z "${RENDER_GROUP_ID}" ]; then
    if [ "${RENDER_GROUP_ID}" -ne 0 ]; then
        groupadd -g "${RENDER_GROUP_ID}" render
        usermod -aG render odm
    fi
fi

while IFS='=' read -r name value ; do
    echo "export ${name}=\"${value}\"" >> /home/odm/env
done < <(env | grep -v "HOME")
chown odm:odm /home/odm/env

su - odm -c "source /home/odm/env; cd /var/www; echo $WO_DEFAULT_NODES; /usr/bin/node /var/www/index.js $@"
