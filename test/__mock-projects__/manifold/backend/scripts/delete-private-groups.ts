import { convertContract } from 'common/supabase/contracts'
import { runScript } from 'run-script'
import { setAdjustProfitFromResolvedMarkets } from 'shared/helpers/user-contract-metrics'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getUser } from 'shared/utils'

runScript(async ({ pg }) => {
  console.log(`deleting all private comments`)
  await pg.none(`delete from contract_comments where visibility = 'private'`)

  const sinclair = await getUser('0k1suGSJKVUnHbCPEhHNpgZPkUP2')
  if (!sinclair) {
    console.error('Sinclair not found')
    process.exit(1)
  }

  // Note that all private multi markets have been resolved by now, so this should work
  console.log('N/A all private binary markets')
  const unresolvedContracts = await pg.map(
    `select * from contracts where visibility = 'private'
    and resolution is null
    and mechanism != 'none'`,
    [],
    convertContract
  )

  for (const contract of unresolvedContracts) {
    const creator = await getUser(contract.creatorId)
    if (!creator) {
      console.error(`Creator not found for contract ${contract.id}`)
      continue
    }
    await resolveMarketHelper(contract, sinclair, creator, {
      outcome: 'CANCEL',
    })
    await setAdjustProfitFromResolvedMarkets(contract.id)
  }

  console.log(`redacting all answers`)
  await pg.none(
    `with private_contracts as (
      select id from contracts where visibility = 'private' and mechanism = 'cpmm-multi-1'
    )
    update answers
    set data = data || jsonb_build_object('text', '[deleted answer ' || index || ']')
    where contract_id in (select id from private_contracts)`
  )

  console.log(`overwriting and marking deleted all private contracts`)
  await pg.none(
    `update contracts
    set data = data || '{
      "wasPrivate": true,
      "visibility": "unlisted",
      "isRanked": false,
      "deleted": true,
      "question": "Private Question (deleted)",
      "description": "",
      "answers": [], 
      "groupSlugs": [],
      "groupLinks": []
    }'::jsonb
    || jsonb_build_object('slug', 'private-auto-deleted-' || random_alphanumeric(8))
    || jsonb_build_object('lastUpdatedTime', ts_to_millis(now()))
  where visibility = 'private'`
  )
  // note that answers will get overwritten by the denormalizer, but we set to empty to prevent data leakage.

  console.log('deleting all private groups')
  // copied from scripts/delete-group.ts
  const groupIds = await pg.map(
    `select id from groups where privacy_status = 'private'`,
    [],
    (data: any) => data.id as string
  )
  console.log(groupIds)
  console.log('removing groups from posts')
  await pg.none(
    'update old_posts set group_id = null where group_id in ($1:list)',
    [groupIds]
  )

  console.log('removing groups from contracts')
  await pg.none(`delete from group_contracts where group_id in ($1:list)`, [
    groupIds,
  ])

  console.log('removing groups members')
  await pg.none(`delete from group_members where group_id in ($1:list)`, [
    groupIds,
  ])
  console.log('deleting groups')
  await pg.none(`delete from groups where id in ($1:list)`, [groupIds])
})
