# scheduler

Service responsible for running scheduled jobs over Manifold data.

## To deploy

You must have set up the `gcloud` cli following the [functions/README](../functions/README.md#installing-for-local-development).

`./deploy-scheduler.sh [dev|prod]` will deploy to the respective environments.

## Operating

GCP instances in our projects use the Google "OS login" functionality. To SSH into them, you will need to associate an SSH key with your Google account (perhaps on both `dev-mantic-markets` and `mantic-markets`). If you do

```
$ gcloud compute ssh scheduler
```

it should prompt you to make a new key. Or to use an existing key you have, you can do:

```
$ gcloud compute os-login ssh-keys add --key-file=KEY_FILE_PATH --project=PROJECT
```
