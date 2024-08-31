import { log, revalidateStaticProps } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { bulkUpdate } from 'shared/supabase/utils'
import { SEASONS } from 'common/leagues'

export async function updateLeagueRanks() {
  const pg = createSupabaseDirectClient()

  const season = SEASONS[SEASONS.length - 1]

  log('Loading user ranks...')
  const userIds = await pg.manyOrNone<{ id: string; rank: number }>(
    `select id, rank from users
    join user_league_info uli on uli.user_id = users.id
    where uli.season = $1`,
    [season]
  )
  log(`Loaded ${userIds.length} user ids and ranks.`)

  const rankUpdates = userIds.map((u) => {
    return {
      user_id: u.id,
      season,
      rank_snapshot: +u.rank,
    }
  })

  await bulkUpdate(pg, 'leagues', ['user_id', 'season'], rankUpdates)
  await revalidateStaticProps('/leagues')
  log('Done.')
}
