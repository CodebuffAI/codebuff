import { BOT_USERNAMES } from 'common/envs/constants'
import { groupBy, mapValues } from 'lodash'
import { runScript } from 'run-script'
import {
  addToLeagueIfNotInOne,
  getUsersNotInLeague,
} from 'shared/generate-leagues'
import { SupabaseDirectClient } from 'shared/supabase/init'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const userIds = await getUsersNotInLeague(pg, 1)
    console.log('userIds', userIds)
    const divisions = []
    for (const userId of userIds) {
      divisions.push((await addToLeagueIfNotInOne(pg, userId)).division)
      console.log(
        'Added user',
        userId,
        'to league',
        divisions[divisions.length - 1]
      )
    }
    console.log(
      mapValues(
        groupBy(divisions, (d) => d),
        (d) => d.length
      )
    )
  })
}

const _reassignBots = (pg: SupabaseDirectClient) => {
  return pg.none(
    `update leagues
    set division = 4,
        cohort = 'bots'
    where user_id in (
        select id from users
        where username in ($1:csv)
        limit 40
    )`,
    [BOT_USERNAMES]
  )
}
