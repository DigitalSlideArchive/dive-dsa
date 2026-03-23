#!/bin/bash
set -e # exit immediately on fail

# This script is intended as an optional local utility.
# CI runs are expensive, so you can use this to run all
# CI Checks locally in parallel to verify that a commit will pass
# in much less time than CI would take.

npm ci

npm test

npm run lint &
npm run lint:templates

npm run build:web &
npm run build:lib &
npm run build:cli &

time wait 
