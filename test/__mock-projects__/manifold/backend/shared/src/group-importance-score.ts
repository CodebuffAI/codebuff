import { createSupabaseDirectClient } from 'shared/supabase/init'
import { map, orderBy, range, sum, uniq } from 'lodash'
import { bulkUpdate } from 'shared/supabase/utils'
import { MIN_IMPORTANCE_SCORE } from 'shared/importance-score'

const MARKETS_PER_GROUP = 50

export async function calculateGroupImportanceScore(readOnly = false) {
  const pg = createSupabaseDirectClient()
  const importantContracts = await pg.map(
    `select c.importance_score, gc.group_id 
            from contracts c
            join group_contracts gc on c.id = gc.contract_id
            where c.importance_score > $1
      `,
    [MIN_IMPORTANCE_SCORE],
    (r) => ({
      importance_score: r.importance_score,
      group_id: r.group_id as string,
    })
  )
  const groupIdsFromContracts = uniq(importantContracts.map((c) => c.group_id))

  const importantGroupIds = await pg.map(
    `select id from groups 
              where importance_score > $1`,
    [MIN_IMPORTANCE_SCORE],
    (r) => r.id as string
  )
  const uniqueGroupIds = uniq(groupIdsFromContracts.concat(importantGroupIds))

  const mostImportantContractsByGroupId = Object.fromEntries(
    uniqueGroupIds.map((id) => [
      id,
      orderBy(
        importantContracts.filter((c) => c.group_id === id),
        'importance_score',
        'desc'
      ).slice(0, MARKETS_PER_GROUP),
    ])
  )

  if (!readOnly)
    await bulkUpdate(
      pg,
      'groups',
      ['id'],
      uniqueGroupIds.map((id) => ({
        id: id,
        importance_score: calculateGroupImportanceScoreForGroup(
          MARKETS_PER_GROUP,
          mostImportantContractsByGroupId[id].map((c) => c.importance_score)
        ),
      }))
    )
}
// [sum from i = 1 to n of 1/i * (importance_i) ] / log n
function calculateGroupImportanceScoreForGroup(
  n: number,
  scoresOrderedByImportance: number[]
): number {
  if (scoresOrderedByImportance.length === 0) return 0
  const indexes = range(1, n + 1)
  const scoresSum = sum(
    map(indexes, (i) => (1 / i) * (scoresOrderedByImportance[i - 1] ?? 0))
  )
  return scoresSum / Math.log(n)
}
