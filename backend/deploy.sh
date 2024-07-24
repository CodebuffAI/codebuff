#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

GCP_PROJECT=${GCP_PROJECT:-"manicode-430317"}
APP_PORT=${APP_PORT:-"4242"}
VM_NAME=${VM_NAME:-"manicode-backend"}
VM_ZONE=${VM_ZONE:-"us-east4-a"}
VM_MACHINE_TYPE=${VM_MACHINE_TYPE:-"e2-micro"}

echo "Using VM: $VM_NAME in zone: $VM_ZONE"
echo "Google Cloud Project: $GCP_PROJECT"
echo "Application Port: $APP_PORT"

# Build the project
echo "Building the project..."
yarn build

# Build and tag the Docker image
echo "Building Docker image..."
docker build --build-arg APP_PORT=$APP_PORT -t gcr.io/$GCP_PROJECT/manicode-backend:latest .

# Push the image to Google Container Registry
echo "Pushing image to Google Container Registry..."
docker push gcr.io/manicode-430317/manicode-backend:latest

# Ensure the firewall rule for the app port exists
FIREWALL_RULE_NAME="allow-$APP_PORT"
if ! gcloud compute firewall-rules describe $FIREWALL_RULE_NAME --project=$GCP_PROJECT &>/dev/null; then
    echo "Creating firewall rule to allow traffic on port $APP_PORT..."
    gcloud compute firewall-rules create $FIREWALL_RULE_NAME \
        --allow=tcp:$APP_PORT \
        --target-tags=http-server \
        --project=$GCP_PROJECT
fi

# Create or update the VM instance with the container
# Check if the VM instance already exists
if gcloud compute instances describe $VM_NAME --zone=$VM_ZONE --project=$GCP_PROJECT &>/dev/null; then
    echo "Existing VM instance found. Deleting it to create a new container-based instance..."
    gcloud compute instances delete $VM_NAME --zone=$VM_ZONE --project=$GCP_PROJECT --quiet
fi

echo "Creating new VM instance with container..."
gcloud compute instances create-with-container $VM_NAME \
    --zone=$VM_ZONE \
    --project=$GCP_PROJECT \
    --machine-type=$VM_MACHINE_TYPE \
    --container-image=gcr.io/$GCP_PROJECT/manicode-backend:latest \
    --container-env=APP_PORT=$APP_PORT \
    --tags=http-server \
    --scopes=https://www.googleapis.com/auth/cloud-platform \
    --image-family=cos-stable \
    --image-project=cos-cloud \
    --boot-disk-size=10GB \
    --boot-disk-type=pd-balanced

# Wait for the VM to be ready (adjust the sleep time if needed)
echo "Waiting for VM to be ready..."
sleep 60

echo "Deployment completed successfully!"
echo "Your application should now be accessible at: http://$(gcloud compute instances describe $VM_NAME --zone=$VM_ZONE --project=$GCP_PROJECT --format='get(networkInterfaces[0].accessConfigs[0].natIP)'):$APP_PORT"