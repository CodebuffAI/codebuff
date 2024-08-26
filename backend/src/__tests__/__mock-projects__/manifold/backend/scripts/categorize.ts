import { initAdmin } from 'shared/init-admin'

initAdmin()

import { run } from 'common/supabase/utils'
import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { createSupabaseClient } from 'shared/supabase/init'

async function main(question: string) {
  console.log('finding group for question:', question)
  const embeddings = await generateEmbeddings(question)
  console.log(embeddings?.length, 'embeddings for 1')

  const db = createSupabaseClient()
  await run(
    db
      .from('contract_embeddings')
      .insert({ contract_id: 'sxlef', embedding: embeddings })
  )
    .then((res: any) => console.log('inserted embeddings', res))
    .catch((e) => console.log('error', e))
}

if (require.main === module) {
  main(process.argv[2]).then(() => process.exit())
}
