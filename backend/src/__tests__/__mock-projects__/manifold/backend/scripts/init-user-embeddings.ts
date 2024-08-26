import { initAdmin } from 'shared/init-admin'
initAdmin()

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'

async function main() {
  const pg = createSupabaseDirectClient()

  console.log('Starting init-user-embeddings.ts...')
  const userIds = await pg.map(
    'select id from users',
    [],
    (r: { id: string }) => r.id
  )
  for (const userId of userIds) {
    console.log('userId', userId)
    await updateUserInterestEmbedding(pg, userId)
  }
}

if (require.main === module) {
  main().then(() => process.exit())
}
