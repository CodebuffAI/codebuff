import { groupBy, mapValues, sortBy } from 'lodash'

import { bulkUpdateData, getIds } from 'shared/supabase/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export async function updateGroupMetricsCore() {
  const pg = createSupabaseDirectClient()
  log('Loading group IDs...')
  const groupIds = await getIds(pg, 'groups')
  log(`Loaded ${groupIds.length} group IDs.`)

  log(`Loading contract creator scores...`)
  const groupCreatorScores = await pg.manyOrNone(
    `with creator_scores as (
      select
        gc.group_id, c.creator_id, count(*) as score,
        row_number() over (partition by gc.group_id order by count(*) desc) as nth
      from group_contracts as gc
      join contracts as c on gc.contract_id = c.id
      join user_contract_metrics as ucm on ucm.contract_id = gc.contract_id
        where ucm.answer_id is null
      group by gc.group_id, c.creator_id
    )
    select * from creator_scores where nth <= 50`
  )
  const creatorScoresByGroup = mapValues(
    groupBy(groupCreatorScores, (r) => r.group_id as string),
    (rows) =>
      rows.map((r) => ({
        userId: r.creator_id as string,
        score: parseFloat(r.score as string),
      }))
  )

  log(`Loading contract profit scores...`)
  const groupProfitScores = await pg.manyOrNone(
    `with profit_scores as (
      select
        gc.group_id, ucm.user_id, sum(ucm.profit) as score,
        row_number() over (partition by gc.group_id order by sum(ucm.profit) desc) as nth
      from group_contracts as gc
      join user_contract_metrics as ucm on ucm.contract_id = gc.contract_id
      where ucm.answer_id is null
      group by gc.group_id, ucm.user_id
    )
    select * from profit_scores where nth <= 50`
  )
  const profitScoresByGroup = mapValues(
    groupBy(groupProfitScores, (r) => r.group_id as string),
    (rows) =>
      rows.map((r) => ({
        userId: r.user_id as string,
        score: parseFloat(r.score as string),
      }))
  )

  log('Updating leaderboards...')

  const updates = groupIds.map((groupId) => {
    const topTraderScores = profitScoresByGroup[groupId] ?? []
    const topCreatorScores = creatorScoresByGroup[groupId] ?? []
    return {
      id: groupId,
      cachedLeaderboard: {
        topTraders: sortBy(topTraderScores, (x) => -x.score),
        topCreators: sortBy(topCreatorScores, (x) => -x.score),
      },
    }
  })
  await bulkUpdateData(pg, 'groups', updates)
}
