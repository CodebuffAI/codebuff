import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as admin from 'firebase-admin'

import { getServiceAccountCredentials } from 'common/secrets'

const getFirebaseProjectRoot = (cwd: string) => {
  // see https://github.com/firebase/firebase-tools/blob/master/src/detectProjectRoot.ts
  let dir = cwd
  while (!fs.existsSync(path.resolve(dir, './firebase.json'))) {
    const parentDir = path.dirname(dir)
    if (parentDir === dir) {
      return null
    }
    dir = parentDir
  }
  return dir
}

export const getFirebaseActiveProject = (cwd: string) => {
  // firebase uses this configstore package https://github.com/yeoman/configstore/blob/main/index.js#L9
  const projectRoot = getFirebaseProjectRoot(cwd)
  if (projectRoot == null) {
    return null
  }
  const xdgConfig =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  const configPath = path.join(xdgConfig, 'configstore', 'firebase-tools.json')
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return config['activeProjects'][projectRoot]
  } catch (e) {
    return null
  }
}

export const getLocalEnv = () => {
  const activeProject = getFirebaseActiveProject(process.cwd())
  if (activeProject == null) {
    throw new Error(
      "Couldn't find active Firebase project; did you do `firebase use <alias>?`"
    )
  }

  return activeProject.toUpperCase() as 'PROD' | 'DEV'
}

// Locally initialize Firebase Admin.
export const initAdmin = () => {
  try {
    const env = getLocalEnv()
    const serviceAccount = getServiceAccountCredentials(env)
    console.log(
      `Initializing connection to ${serviceAccount.project_id} Firebase...`
    )
    return admin.initializeApp({
      projectId: serviceAccount.project_id,
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${serviceAccount.project_id}.appspot.com`,
    })
  } catch (err) {
    console.error(err)
    console.log(`Initializing connection to default Firebase...`)
    return admin.initializeApp()
  }
}
