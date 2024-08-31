import { getReplicatorUrl } from 'common/api/utils'
import { log } from 'shared/utils'
import { getLocalEnv, initAdmin } from 'shared/init-admin'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
initAdmin()
import * as admin from 'firebase-admin'

// NOTE: the replicator instance does all of this automatically.
// You can run this if you want to see how many failed writes there are.
const main = async () => {
  const env = getLocalEnv()
  const credentials = getServiceAccountCredentials(env)
  await loadSecretsToEnv(credentials)
  const firestore = admin.firestore()
  const failedWritesCount = await firestore
    .collection('replicationState')
    .doc('supabase')
    .collection('failedWrites')
    .count()
    .get()

  console.log('failedWritesCount', failedWritesCount.data().count)
  let n = 1
  while (n > 0) {
    const url = getReplicatorUrl() + '/replay-failed'
    log('Calling replay failed endpoint', url)
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }).catch((e) => {
      console.error(e)
      return null
    })
    if (!res) break
    const body = await res.json()
    console.log('response', body)
    n = body.n
  }
  process.exit()
}
if (require.main === module) {
  main()
}
