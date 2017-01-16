FROM ubuntu:latest

MAINTAINER NeonCity team <horia141@gmail.com>

# Install global packages.

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
            git \
            nodejs-legacy \
            npm && \
    apt-get clean

# Setup directory structure.

RUN mkdir /neoncity
RUN mkdir /neoncity/pack
RUN mkdir /neoncity/var

# Setup users and groups.

RUN groupadd neoncity && \
    useradd -ms /bin/bash -g neoncity neoncity

# Install package requirements.

COPY package.json /neoncity/pack/package.json
RUN cd /neoncity/pack && npm install --registry=https://npm-proxy.fury.io/vsRAKKMwEs5p1RhfMGiF/neoncity/ --progress=false

# Copy source code.

COPY . /neoncity/pack

# Setup the runtime environment for the application.

ENV ENV LOCAL
ENV ADDRESS 0.0.0.0
ENV PORT 10000
ENV DATABASE_URL postgresql://neoncity:neoncity@neoncity-postgres:5432/neoncity
ENV SECRETS_PATH /neoncity/var/secrets.json

RUN chown -R neoncity:neoncity /neoncity
VOLUME ["/neoncity/pack/src"]
VOLUME ["/neoncity/var/secrets.json"]
WORKDIR /neoncity/pack
EXPOSE 10000
USER neoncity
ENTRYPOINT ["npm", "run", "serve"]
