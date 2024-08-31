import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getUser } from 'shared/utils'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { first, uniq } from 'lodash'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { HIDE_FROM_NEW_USER_SLUGS } from 'common/envs/constants'
import { TOPICS_TO_GROUP_ID } from 'common/topics'

async function main() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  const pg = createSupabaseDirectClient()

  console.log('Starting convert-topics-to-groups.ts...')
  const creator = await getUser(HOUSE_LIQUIDITY_PROVIDER_ID)
  if (!creator) throw new Error('Could not find creator user')

  for (const topic of Object.keys(TOPICS_TO_GROUP_ID)) {
    const contractIdsToAddToGroup: string[] = []
    await pg.map(
      `
          with topic_embedding as (
              select embedding
              from topic_embeddings
              where topic = $1
              limit 1
          ),
               contract_embeddings as (
                   select contract_id, embedding
                   from contract_embeddings
               )
          select contract_embeddings.contract_id as contract_id
          from contract_embeddings
                   join topic_embedding on true
                   join contracts on contracts.id = contract_embeddings.contract_id
                   join group_contracts on group_contracts.contract_id = contract_embeddings.contract_id
          where (contract_embeddings.embedding <=> topic_embedding.embedding) < 0.21
            and not exists (
              select 1
              from group_contracts as gc
              where gc.contract_id = contract_embeddings.contract_id
                and gc.group_id = $2
          )
            and not (contracts.data->'groupSlugs' ?| $3)
            and contracts.question not ilike '%stock%'
            and char_length(contracts.question) > 10
            and contracts.visibility != 'private' 
            and contracts.visibility != 'unlisted'
            and contracts.outcome_type != 'STONK'
            and contracts.creator_id != 'PzOAq29wOnWw401h613wyQPvbZF2'
          ;
      `,
      [topic, TOPICS_TO_GROUP_ID[topic], HIDE_FROM_NEW_USER_SLUGS],
      (row: { contract_id: string }) => {
        contractIdsToAddToGroup.push(row.contract_id)
      }
    )
    console.log(
      `Found ${contractIdsToAddToGroup.length} contracts to add to group ${TOPICS_TO_GROUP_ID[topic]}`
    )
    await Promise.all(
      uniq(contractIdsToAddToGroup).map(async (contractId) => {
        const contract = first(
          await pg.map(
            `select data from contracts where id = $1`,
            [contractId],
            (row: any) => row.data
          )
        )
        const group = first(
          await pg.map(
            `select data, id from groups where id = $1`,
            [TOPICS_TO_GROUP_ID[topic]],
            (row: any) => ({ ...row.data, id: row.id })
          )
        )
        const added = await addGroupToContract(contract, group, pg)
        console.log(
          'contract question:',
          contract.question,
          'contract id:',
          contract.id,
          '\ngroup name:',
          group.name,
          'group id:',
          group.id,
          'added:',
          added
        )
      })
    )
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
