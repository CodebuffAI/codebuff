# Firestore Cloud Functions

This is code that doesn't make sense on the frontend client, e.g.

- Long-running or slow operation (database)
- Tasks that need to be run every so often (syncing email list to Mailjet)
- Anything we should't trust to clients (secrets, auth)

If you want to make and test changes, you'll have to do a bit of setup...

## Installing

Adapted from https://firebase.google.com/docs/functions/get-started

0. `$ cd backend/functions` to switch to this folder
1. `$ yarn global add firebase-tools` to install the Firebase CLI globally
2. `$ yarn` to install JS dependencies
3. `$ firebase login` to authenticate the CLI tools to Firebase
4. `$ firebase use dev` to choose the dev project

## Installing for local development

0. [Install](https://cloud.google.com/sdk/docs/install) gcloud CLI
1. If you don't have java (or see the error `Error: Process java -version has exited with code 1. Please make sure Java is installed and on your system PATH.`):

   1. `$ brew install java`
   2. `$ sudo ln -sfn /opt/homebrew/opt/openjdk/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk.jdk`

2. `$ gcloud auth login` to authenticate the CLI tools to Google Cloud
3. `$ gcloud config set project <project-id>` to choose the project (`$ gcloud projects list` to see options)

### Setting up Authentication

Generate new private keys from the Google service account management page:

- Dev: https://console.firebase.google.com/u/0/project/dev-mantic-markets/settings/serviceaccounts/adminsdk

- Prod: https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk

Set environment variable `GOOGLE_APPLICATION_CREDENTIALS_PROD` or `GOOGLE_APPLICATION_CREDENTIALS_DEV` in your shell to the path of the key file.

e.g. in `~/.zshrc` or `~/.bashrc`

```
export GOOGLE_APPLICATION_CREDENTIALS_DEV=~/dev-mantic-market.json
```

## Developing locally

- In root directory run `$ ./dev.sh dev` to start the dev functions, the /api docker image, and /web frontend. Note the database is the dev db.

  - Or `$ yarn serve` in this directory to start the functions only

- If you want to test a scheduled function replace your function in [test-backend-function.ts](../scripts/test-backend-function.ts) and run the file

## Developing with localdb

Developing with a local copy of the database is deprecated. The old instructions are on [Notion](https://www.notion.so/manifoldmarkets/How-localdb-worked-c0c3d541005a417f9adfabf63285f440) (or in the git history of this README file)

## Debugging

- Find local logs directly in the shell
- Find deployed logs in the [Firebase console](https://console.firebase.google.com/project/mantic-markets/functions/logs?search=&&severity=DEBUG)

## Deploying

0. After merging, you need to manually deploy to backend:
1. `git checkout main`
1. `git pull origin main`
1. `firebase use prod` to switch to prod
1. `firebase deploy --only functions` to push your changes live!

## Secrets management

Secrets are strings that shouldn't be checked into Git (eg API keys, passwords).

Add or remove keys using [Google Secret Manager](https://console.cloud.google.com/security/secret-manager), which provides them as environment variables to functions that require them.

[Dev secrets manager](https://console.cloud.google.com/security/secret-manager?project=dev-mantic-markets)
[Prod secrets manager](https://console.cloud.google.com/security/secret-manager?project=mantic-markets)

Secondly, please update the list of secret keys at `common/src/secrets.ts`. Only these keys are provided to functions, scripts, and the api.
