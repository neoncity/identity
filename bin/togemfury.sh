#!/bin/sh

ls -lah

npm pack
mv `ls identity-*.tgz` identity.tgz
curl -v -F package=@identity.tgz https://vsRAKKMwEs5p1RhfMGiF@push.fury.io/neoncity/ > result
if [ -z "$(grep -e ok result)" ]
then
    rm result
    exit 1
fi
rm result

