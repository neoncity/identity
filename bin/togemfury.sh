#!/bin/sh

ls -lah

npm pack
curl -s -F package=@`ls identity-*.tgz` ${NPM_CONFIG_REGISTRY} > result
if [ -z "$(grep -e ok result)" ]
then
    rm result
    exit 1
fi
rm result

