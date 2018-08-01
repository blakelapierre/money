#!/bin/bash

YELLOW='\033[1;33m'
NC='\033[0m'

print() {
  echo -e "${YELLOW}$1${NC}"
}

print "Creating $1"

git clone git@github.com:blakelapierre/base-node "$1" \
  && cd "$1" \
  && print "Setting upstream repo..." \
  && git remote rename origin upstream \
  && print "Installing dependencies..." \
  && npm install \
  && npm install -g gulp gulpur \