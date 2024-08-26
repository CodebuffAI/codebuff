import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'
import { chunk } from 'lodash'

async function main() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  const pg = createSupabaseDirectClient()

  console.log('Starting fix-user-embeddings.ts...')
  const totalUserIds = await pg.map(
    `select user_id from user_embeddings`,
    [],
    (r: { user_id: string }) => r.user_id
  )
  console.log(`Found ${totalUserIds.length} users with embeddings to fix`)
  let count = 0
  const chunks = chunk(totalUserIds, 500)
  for (const userIds of chunks) {
    await Promise.all(
      userIds.map(async (userId) => {
        await updateUserInterestEmbedding(pg, userId)
      })
    )
    count += userIds.length
    console.log(`Updated ${count} of ${totalUserIds.length} users`)
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit())
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
