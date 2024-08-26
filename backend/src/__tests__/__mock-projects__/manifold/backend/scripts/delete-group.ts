import { updateGroupLinksOnContracts } from 'merge-groups'
import { runScript } from 'run-script'
import { SupabaseDirectClient } from 'shared/supabase/init'

async function deleteGroup(
  pg: SupabaseDirectClient,
  firestore: any,
  slug: string
) {
  const groupId = await pg.one(
    'select id from groups where slug = $1',
    [slug],
    (row) => row.id
  )

  console.log('removing group from posts')
  await pg.none('update old_posts set group_id = null where group_id = $1', [
    groupId,
  ])

  const contracts = await pg.map(
    'select contract_id from group_contracts where group_id = $1',
    [groupId],
    (row) => row.contract_id
  )

  if (contracts.length > 0) {
    console.log('removing group from contracts')
    await pg.none('delete from group_contracts where group_id = $1', [groupId])
    console.log('correcting contract group slugs')
    await updateGroupLinksOnContracts(pg, firestore, contracts)
  }

  console.log('removing group members')
  await pg.none('delete from group_members where group_id = $1', [groupId])
  console.log('deleting group')
  await pg.none('delete from groups where id = $1', [groupId])
}

if (require.main === module) {
  if (process.argv.length < 3) {
    console.error('usage: delete-group.ts <group slug>')
    process.exit(1)
  }

  runScript(async ({ pg, firestore }) => {
    await deleteGroup(pg, firestore, process.argv[2])
  })
}
