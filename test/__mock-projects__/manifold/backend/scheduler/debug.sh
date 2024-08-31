#!/bin/bash

# Script to make it easy to tunnel into the currently running scheduler instance on GCP
# so that you can debug the Node process, e.g. to set breakpoints (in dev!!), use the REPL,
# or do performance or memory profiling.

set -e

if [ -z "$1" ]; then
    echo "Usage: the first argument should be 'dev' or 'prod'"
    exit 1
fi

SERVICE_NAME="scheduler"
ZONE="us-east4-a"
ENV=${1:-dev}

case $ENV in
    dev)
        GCLOUD_PROJECT=dev-mantic-markets ;;
    prod)
        GCLOUD_PROJECT=mantic-markets ;;
    *)
        echo "Invalid environment; must be dev or prod."
        exit 1
esac

echo "Forwarding debugging port 9229 to ${SERVICE_NAME}. Open chrome://inspect in Chrome to connect."
gcloud compute ssh ${SERVICE_NAME} \
       --project=${GCLOUD_PROJECT} \
       --zone=${ZONE} \
       -- \
       -NL 9229:localhost:9229
