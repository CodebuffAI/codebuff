# Manicode Backend

## Deployment

To deploy the Manicode backend to Google Cloud Platform, follow these steps:

1. Set up a Google Cloud Platform project and enable the necessary APIs. See: https://cloud.google.com/sdk/docs/install.
2. Login to the Google Cloud Platform CLI with the command:
   `gcloud auth login`.
3. Set your project ID: to `manicode-430317`
   `gcloud config set project manicode-430317`
4. Configure Docker to push to gcloud.
   `gcloud auth configure-docker`
5. Run ./deploy.sh to build and push the Docker image to Google Container Registry.
