import { getLocalEnv, initAdmin } from 'shared/init-admin'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'

initAdmin()

export const runScript = async (
  main: () => Promise<any> | any
) => {
  const env = getLocalEnv()
  const credentials = getServiceAccountCredentials(env)

  await loadSecretsToEnv(credentials)

  await main()

  process.exit()
}
