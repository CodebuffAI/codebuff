import { z } from 'zod'

import { authEndpoint, validate } from './helpers/endpoint'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getSeasonDates } from 'common/leagues'
import { uniq } from 'lodash'
import { Contract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'
import { log } from 'shared/utils'

const bodySchema = z
  .object({
    season: z.number(),
    cohort: z.string(),
  })
  .strict()

export const leagueActivity = authEndpoint(async (req) => {
  const { season, cohort } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()
  return await getLeagueActivity(pg, season, cohort)
})

export const getLeagueActivity = async (
  pg: SupabaseDirectClient,
  season: number,
  cohort: string
) => {
  const userIds = await pg.map(
    `select user_id from leagues
    where season = $1 and cohort = $2
  `,
    [season, cohort],
    (row: { user_id: string }) => row.user_id
  )

  const { start, end } = getSeasonDates(season)

  const bets = await pg.map<Bet>(
    `select
      cb.data
    from contract_bets cb
    where
      cb.user_id = any($1)
      and cb.created_time >= $2
      and cb.created_time < $3
      and is_redemption = false
    order by cb.created_time desc
    limit 10000
  `,
    [userIds, start, end],
    (row) => row.data
  )
  log('bets ' + bets.length)

  const comments = await pg.map<ContractComment>(
    `select
      cc.data
    from contract_comments cc
    where
      cc.user_id = any($1)
      and cc.created_time >= $2
      and cc.created_time < $3
    order by cc.created_time desc
    limit 1000
  `,
    [userIds, start, end],
    (row) => row.data
  )
  log('comments ' + comments.length)

  const contractIds = uniq([
    ...bets.map((b) => b.contractId),
    ...comments.map((c) => c.contractId),
  ])

  const contracts = await pg.map<Contract>(
    `select
      data from contracts
    where
      contracts.id = any($1)
      and contracts.visibility = 'public'
      `,
    [contractIds],
    (row) => row.data
  )

  const contractSet = new Set(contracts.map((contract) => contract.id))
  const publicBets = bets.filter((bet) => contractSet.has(bet.contractId))
  const publicComments = comments.filter((comment) =>
    contractSet.has(comment.contractId)
  )
  return {
    contracts,
    bets: publicBets,
    comments: publicComments,
  }
}
