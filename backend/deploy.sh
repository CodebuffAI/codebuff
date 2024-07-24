#!/bin/bash

yarn build

docker build -t gcr.io/manicode-430317/manicode-backend .