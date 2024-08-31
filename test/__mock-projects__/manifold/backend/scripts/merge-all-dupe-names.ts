import { mergeGroups } from 'merge-groups'
import { runScript } from 'run-script'
import { SupabaseDirectClient } from 'shared/supabase/init'

const mergeAllDupes = async (pg: SupabaseDirectClient, firestore: any) => {
  const dupeNames = await pg.manyOrNone<{
    name_fts: string
    slug: string
    id: string
    importance_score: number
    rank: number
  }>(
    `SELECT
      name_fts, name, slug, id, importance_score,
      ROW_NUMBER() OVER(PARTITION BY name_fts ORDER BY importance_score DESC, total_members DESC) AS rank
    FROM groups
    WHERE
      privacy_status = 'public'
      and name_fts in (
        select name_fts
          from groups
          where privacy_status = 'public'
          and name_fts != ''
          and name not in (
            'Anime',
            'Animals',
            'Animation',
            'Avatars',
            'Avatar',
            'Disney+',
            'Disney',
            'Curling',
            'Curl',
            'Musicals',
            'Personal',
            'Personality',
            'Production',
            'Productivity',
            'Products',
            'tests'
          )
          group by name_fts
          having count(*) > 1
      )`
  )

  let top = dupeNames[0]
  for (const group of dupeNames) {
    if (group.rank == 1) {
      top = group
    } else if (group.name_fts == top.name_fts) {
      console.log('merge', group.slug, top.slug)
      await mergeGroups(pg, firestore, group.slug, top.slug)
    }
  }
}

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    await mergeAllDupes(pg, firestore)
  })
}
