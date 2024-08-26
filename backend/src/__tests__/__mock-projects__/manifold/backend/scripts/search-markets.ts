import { initAdmin } from 'shared/init-admin'
initAdmin()

import { createSupabaseClient } from 'shared/supabase/init'
import { generateEmbeddings } from 'shared/helpers/openai-utils'

const db = createSupabaseClient()

async function main() {
  const question = process.argv[2]
  console.log('Getting markets related to', question)

  const embedding = await generateEmbeddings(question)
  if (!embedding || embedding.length < 1500) {
    console.log('No embeddings for', question)
    return
  }
  console.log('Embedding generated. Searching...')

  const { data } = await db.rpc('search_contract_embeddings' as any, {
    query_embedding: embedding,
    similarity_threshold: 0.75,
    match_count: 10,
  })

  const getQuestion = (cid: string) =>
    db
      .from('contracts')
      .select('data')
      .eq('id', cid)
      .then((r) => (r?.data as any)[0].data.question)

  const contractsIds = (data as any).map((d: any) => d.contract_id)

  console.log('Results:')
  console.log()
  const questions = await Promise.all(contractsIds.map(getQuestion))
  for (const q of questions) {
    console.log(q)
  }
}

if (require.main === module) {
  main().then(() => process.exit())
}
