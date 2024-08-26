import { UNRANKED_GROUP_ID } from 'common/supabase/groups'
import { runScript } from 'run-script'
import { SupabaseDirectClient } from 'shared/supabase/init'

async function convertGroup(pg: SupabaseDirectClient, slug: string) {
  const groupId = await pg.one(
    'select id from groups where slug = $1',
    [slug],
    (row) => row.id
  )

  console.log('converting group to curated')
  await pg.none(
    `update groups set data = data || jsonb_build_object('privacyStatus', 'curated') where id = $1`,
    [groupId]
  )

  const contracts = await pg.map(
    'select contract_id from group_contracts where group_id = $1',
    [groupId],
    (row) => row.contract_id as string
  )

  if (contracts.length > 0) {
    console.log(
      `converting ${contracts.length} contracts to unlisted and unranked`
    )

    await pg.none(
      `update contracts set data = data || '{"visibility": "unlisted", "isRanked": false}' where id in ($1:list)`,
      [contracts]
    )

    console.log(`adding unranked tags`)
    for (const id of contracts) {
      await pg.none(
        `insert into group_contracts (contract_id, group_id) values ($1, $2) on conflict do nothing`,
        [id, UNRANKED_GROUP_ID]
      )
    }

    console.log(`converting comments`)
    await pg.none(
      `update contract_comments set data = data || '{"visibility": "unlisted"}'::jsonb where contract_id in ($1:list)`,
      [contracts]
    )

    console.log(`converting bets`)
    await pg.none(
      `update contract_bets set data = data || '{"visibility": "unlisted"}'::jsonb where contract_id in ($1:list)`,
      [contracts]
    )
  }
}

if (require.main === module) {
  if (process.argv.length < 3) {
    console.error('usage: turn-private-group-public.ts <group slug>')
    process.exit(1)
  }

  runScript(async ({ pg }) => {
    await convertGroup(pg, process.argv[2])
  })
}
