import { updateGroupLinksOnContracts } from 'merge-groups'
import { runScript } from 'run-script'
import { type SupabaseDirectClient } from 'shared/supabase/init'

async function deleteTags(
  pg: SupabaseDirectClient,
  firestore: any,
  contractSlug: string,
  exceptions: string[] = []
) {
  const exceptionGroupSlugs = [
    'coolfold',
    'grab-bag',
    'gambling',
    'fun',
    'experimental',
    'nonpredictive',
    'unsubsidized',
    'nsfw',
    ...exceptions,
  ]

  const contract = await pg.one(
    'select id, slug from contracts where slug = $1',
    [contractSlug]
  )

  const contractId = contract.id

  const groups = await pg.many<{ id: string; slug: string }>(
    'select id, slug from groups where slug in ($1:list)',
    [exceptionGroupSlugs]
  )

  const groupIds = groups.map((group) => group.id)

  console.log(`removing tags from ${contract.slug}`)

  await pg.none(
    'delete from group_contracts where contract_id = $1 and group_id not in ($2:list)',
    [contractId, groupIds]
  )

  console.log('correcting contract groupLinks and groupSlugs')
  await updateGroupLinksOnContracts(pg, firestore, [contractId])

  console.log('done')
}

if (require.main === module) {
  if (process.argv.length < 3) {
    console.error(
      'usage: delete-tags.ts <contract_slug> <exception_group_slugs>'
    )
    process.exit(1)
  }

  runScript(async ({ pg, firestore }) => {
    await deleteTags(pg, firestore, process.argv[2], process.argv.slice(3))
  })
}
