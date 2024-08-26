import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { runScript } from './run-script'
import { upsertGroupEmbedding } from 'shared/helpers/embeddings'
import { chunk } from 'lodash'
if (require.main === module) {
  runScript(async ({ pg }) => {
    const contracts = await pg.map(
      `select id, question from contracts
              where visibility = 'public'
            `,
      [],
      (r) => ({ id: r.id, question: r.question })
    )

    console.log('Got', contracts.length, 'markets to process')

    const chunks = chunk(contracts, 100)
    let processed = 0
    for (const contracts of chunks) {
      await Promise.all(
        contracts.map(async (contract) => {
          const { question, id } = contract
          const embedding = await generateEmbeddings(question)
          if (!embedding || embedding.length < 1500) {
            console.log('No embeddings for', question)
            return
          }

          await pg
            .none(
              'insert into contract_embeddings (contract_id, embedding) values ($1, $2) on conflict (contract_id) do update set embedding = $2',
              [id, embedding]
            )
            .catch((err) => console.error(err))
        })
      )
      processed += contracts.length
      console.log('Processed', processed, 'contracts')
    }

    const groupIds = await pg.map(
      `select id from groups`,
      [],
      (r) => r.id as string
    )
    const groupChunks = chunk(groupIds, 100)
    let groupProcessed = 0
    for (const groupIds of groupChunks) {
      await Promise.all(
        groupIds.map(async (groupId) => {
          await upsertGroupEmbedding(pg, groupId)
        })
      )
      groupProcessed += groupIds.length
      console.log('Processed', groupProcessed, 'groups')
    }
  })
}
