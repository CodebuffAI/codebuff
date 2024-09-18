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

## Database

PostgreSQL hosted on Google Cloud.

### Google Cloud Console Instance
https://console.cloud.google.com/sql/instances/pg-manicode/overview?project=manicode-430317

### Environment Variable
- `DATABASE_URL`: Set this environment variable in your .env file to connect to the database.

The DATABASE_URL should follow this format:
```
postgres://{username}:{password}@127.0.0.1:5432/postgres
```

### Migrations
- Migrations are stored in the `./drizzle` folder.
- Run migrations using the `migrate` script in package.json.

### Initial environment setup

1. Ask James for the json file with the service account key.
Service account:
https://console.cloud.google.com/iam-admin/serviceaccounts?project=manicode-430317

2. Add the path to your json key file in your .zshrc:
```bash
export MANICODE_GOOGLE_APPLICATION_CREDENTIALS=/Users/jahooma/manicode-430317-c1245cf33984.json
```

3. Run cloud-sql-proxy

```bash
backend/src/db/mac-cloud-sql-proxy --credentials-file $MANICODE_GOOGLE_APPLICATION_CREDENTIALS manicode-430317:us-east4:pg-manicode &
```

To redownload the script you can run:
For macOS:

```bash
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.0.0/cloud-sql-proxy.darwin.amd64
```

For Linux:
```bash
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.0.0/cloud-sql-proxy.linux.amd64
```

Make the downloaded file executable:
```bash
chmod +x cloud-sql-proxy
```

Note: The process running the Cloud SQL Auth Proxy in the background can be stopped using the fg command in your Terminal window where you started the sample app. This should bring the running Cloud SQL Auth Proxy job to the terminal foreground. Then press Control+C to stop the proxy job.

Another method of running cloud-sql-proxy is through docker, which would work on any OS:

```bash
docker run -d \
  -v PATH_TO_KEY_FILE:$MANICODE_GOOGLE_APPLICATION_CREDENTIALS \
  -p 127.0.0.1:5432:5432 \
  gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.13.0 \
  --address 127.0.0.1 --port 5432 \
  --credentials-file $MANICODE_GOOGLE_APPLICATION_CREDENTIALS manicode-430317:us-east4:pg-manicode
```
