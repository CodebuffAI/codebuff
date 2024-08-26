import { SafeBulkWriter } from 'shared/safe-bulk-writer'
import { type SupabaseDirectClient } from 'shared/supabase/init'
import { bulkUpsert } from 'shared/supabase/utils'
import { runScript } from 'run-script'
import { upsertGroupEmbedding } from 'shared/helpers/embeddings'

// note: you should turn off the on-update-contract trigger (notifications, embedding recalculation) if it's a ton of contracts

export async function mergeGroups(
  pg: SupabaseDirectClient,
  firestore: any,
  fromSlug: string,
  toSlug: string
) {
  if (fromSlug === toSlug) {
    return
  }

  const from = await pg.one(
    'select id from groups where slug = $1',
    [fromSlug],
    (row) => row.id
  )

  const to = await pg.one(
    'select id from groups where slug = $1',
    [toSlug],
    (row) => row.id
  )

  console.log(`merging ${from} into ${to}`)

  console.log('update posts')
  await pg.none('update old_posts set group_id = $1 where group_id = $2', [
    to,
    from,
  ])

  const contracts: string[] = await pg.map(
    'select contract_id from group_contracts where group_id = $1',
    [from],
    (row) => row.contract_id
  )

  // if (contracts.length > 100) {
  //   throw new Error(
  //     `found ${contracts.length} contracts in group ${from}. are you sure?`
  //   )
  // }

  if (contracts.length > 0) {
    console.log(`re-tagging ${contracts.length} contracts`)
    console.log(contracts)

    await bulkUpsert(
      pg,
      'group_contracts',
      ['group_id', 'contract_id'],
      contracts.map((contract) => ({ group_id: to, contract_id: contract }))
    )

    console.log('removing old group contracts')
    await pg.none('delete from group_contracts where group_id = $1', [from])

    console.log('correcting contract group slugs')
    await updateGroupLinksOnContracts(pg, firestore, contracts)

    console.log('recalculating group embedding')
    await upsertGroupEmbedding(pg, to)
  } else {
    console.log('no contracts to re-tag')
  }

  // move members

  const members: string[] = await pg.map(
    'select member_id from group_members where group_id = $1',
    [from],
    (row) => row.member_id
  )

  console.log(`moving ${members.length} members`)

  await bulkUpsert(
    pg,
    'group_members',
    ['group_id', 'member_id'],
    members.map((member) => ({ group_id: to, member_id: member }))
  )

  console.log('correcting group member count')

  await pg.none(
    'update groups set total_members = (select count(*) from group_members where group_id = $1) where id = $1',
    [to]
  )

  console.log('removing old group members')
  await pg.none('delete from group_members where group_id = $1', [from])
  console.log('removing old group')
  await pg.none('delete from groups where id = $1', [from])
}

export async function updateGroupLinksOnContracts(
  pg: SupabaseDirectClient,
  firestore: any,
  contractIds: string[]
) {
  const bulkWriter = new SafeBulkWriter()

  for (const contractId of contractIds) {
    const contractRef = firestore.collection('contracts').doc(contractId)

    const groups = await pg.manyOrNone<{
      group_id: string
      slug: string
      name: string
    }>(
      `select g.id as group_id, g.slug, g.name from groups g join group_contracts gc
      on g.id = gc.group_id where gc.contract_id = $1
      order by g.importance_score desc`,
      [contractId]
    )

    bulkWriter.update(contractRef, {
      groupSlugs: groups.map((g) => g.slug),
      groupLinks: groups.map((g) => ({
        groupId: g.group_id,
        slug: g.slug,
        name: g.name,
      })),
    })
  }

  await bulkWriter.flush()
}

if (require.main === module) {
  if (process.argv.length < 4) {
    console.error('usage: merge-groups.ts <from> <to>')
    process.exit(1)
  }

  runScript(async ({ pg, firestore }) => {
    await mergeGroups(pg, firestore, process.argv[2], process.argv[3])
  })
}
