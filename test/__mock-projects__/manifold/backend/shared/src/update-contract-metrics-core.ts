import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'
import { DAY_MS, MONTH_MS, WEEK_MS } from 'common/util/time'
import { Contract, CPMM } from 'common/contract'
import { computeElasticity } from 'common/calculate-metrics'
import { hasChanges } from 'common/util/object'
import { chunk, groupBy, mapValues } from 'lodash'
import { LimitBet } from 'common/bet'
import { bulkUpdateData } from './supabase/utils'
import { convertAnswer } from 'common/supabase/contracts'
import { bulkUpdateAnswers } from './supabase/answers'

export async function updateContractMetricsCore() {
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  const allContracts = await pg.map(
    `
    select data from contracts
    where (resolution_time is null or resolution_time > now() - interval '1 month')
    `,
    [],
    (r) => r.data as Contract
  )
  log(`Loaded ${allContracts.length} contracts.`)
  const chunks = chunk(allContracts, 1000)
  let i = 0
  for (const contracts of chunks) {
    const contractIds = contracts.map((c) => c.id)
    const answers = await pg.map(
      `select *
       from answers
       where contract_id = any ($1)`,
      [contractIds],
      convertAnswer
    )
    log(`Loaded ${answers.length} answers.`)

    const now = Date.now()
    const dayAgo = now - DAY_MS
    const weekAgo = now - WEEK_MS
    const monthAgo = now - MONTH_MS

    log('Loading current contract probabilities...')
    const currentContractProbs = await getCurrentProbs(pg, contractIds)
    const currentAnswerProbs = Object.fromEntries(
      answers.map((a) => [
        a.id,
        {
          resTime: a?.resolutionTime ?? null,
          resProb:
            a?.resolution === 'YES' ? 1 : a?.resolution === 'NO' ? 0 : null,
          poolProb: a.prob ?? 0.5,
        },
      ])
    )

    log('Loading historic contract probabilities...')
    const [dayAgoProbs, weekAgoProbs, monthAgoProbs] = await Promise.all(
      [dayAgo, weekAgo, monthAgo].map((t) => getBetProbsAt(pg, t, contractIds))
    )

    log('Loading volume...')
    const volume = await getVolumeSince(pg, dayAgo, contractIds)

    log('Loading unfilled limits...')
    const limits = await getUnfilledLimitOrders(pg, contractIds)

    log('Computing metric updates...')

    const contractUpdates: ({ id: string } & Partial<Contract>)[] = []

    const answerUpdates: {
      id: string
      probChanges: {
        day: number
        week: number
        month: number
      }
    }[] = []

    for (const contract of contracts) {
      let cpmmFields: Partial<CPMM> = {}
      if (contract.mechanism === 'cpmm-1') {
        const { poolProb, resProb, resTime } = currentContractProbs[contract.id]
        const prob = resProb ?? poolProb
        const key = `${contract.id} _`
        const dayAgoProb = dayAgoProbs[key] ?? poolProb
        const weekAgoProb = weekAgoProbs[key] ?? poolProb
        const monthAgoProb = monthAgoProbs[key] ?? poolProb
        cpmmFields = {
          prob,
          probChanges: {
            day: resTime && resTime <= dayAgo ? 0 : prob - dayAgoProb,
            week: resTime && resTime <= weekAgo ? 0 : prob - weekAgoProb,
            month: resTime && resTime <= monthAgo ? 0 : prob - monthAgoProb,
          },
        }
      } else if (contract.mechanism === 'cpmm-multi-1') {
        const contractAnswers = answers.filter(
          (a) => a.contractId === contract.id
        )
        for (const answer of contractAnswers) {
          const { poolProb, resProb, resTime } =
            contract.shouldAnswersSumToOne && contract.resolutions
              ? {
                  poolProb: currentAnswerProbs[answer.id].poolProb,
                  resProb: (contract.resolutions[answer.id] ?? 0) / 100,
                  resTime: contract.resolutionTime,
                }
              : currentAnswerProbs[answer.id]
          const prob = resProb ?? poolProb
          const key = `${contract.id} ${answer.id}`
          const dayAgoProb = dayAgoProbs[key] ?? poolProb
          const weekAgoProb = weekAgoProbs[key] ?? poolProb
          const monthAgoProb = monthAgoProbs[key] ?? poolProb
          const answerCpmmFields = {
            probChanges: {
              day: resTime && resTime <= dayAgo ? 0 : prob - dayAgoProb,
              week: resTime && resTime <= weekAgo ? 0 : prob - weekAgoProb,
              month: resTime && resTime <= monthAgo ? 0 : prob - monthAgoProb,
            },
          }
          if (hasChanges(answer, answerCpmmFields)) {
            answerUpdates.push({
              id: answer.id,
              probChanges: answerCpmmFields.probChanges,
            })
          }
        }
      }
      const elasticity = computeElasticity(limits[contract.id] ?? [], contract)
      const update = {
        volume24Hours: volume[contract.id] ?? 0,
        elasticity,
        ...cpmmFields,
      }

      if (hasChanges(contract, update)) {
        contractUpdates.push({ id: contract.id, ...update })
      }
    }

    await bulkUpdateData(pg, 'contracts', contractUpdates)

    i += contracts.length
    log(`Finished ${i}/${allContracts.length} contracts.`)

    log('Writing answer updates...')
    await bulkUpdateAnswers(pg, answerUpdates)

    log('Done.')
  }
}

const getUnfilledLimitOrders = async (
  pg: SupabaseDirectClient,
  contractIds: string[]
) => {
  const unfilledBets = await pg.manyOrNone(
    `select contract_id, data
    from contract_bets
    where (data->'limitProb')::numeric > 0
    and not contract_bets.is_filled
    and not contract_bets.is_cancelled
    and contract_id = any($1)`,
    [contractIds]
  )
  return mapValues(
    groupBy(unfilledBets, (r) => r.contract_id as string),
    (rows) => rows.map((r) => r.data as LimitBet)
  )
}

const getVolumeSince = async (
  pg: SupabaseDirectClient,
  since: number,
  contractIds: string[]
) => {
  return Object.fromEntries(
    await pg.map(
      `select contract_id, sum(abs(amount)) as volume
      from contract_bets
      where created_time >= millis_to_ts($1)
      and not is_redemption
      and contract_id = any($2)
       group by contract_id`,
      [since, contractIds],
      (r) => [r.contract_id as string, parseFloat(r.volume as string)]
    )
  )
}

const getCurrentProbs = async (
  pg: SupabaseDirectClient,
  contractIds: string[]
) => {
  return Object.fromEntries(
    await pg.map(
      `select
         id, resolution_time as res_time,
         get_cpmm_pool_prob(data->'pool', (data->>'p')::numeric) as pool_prob,
         case when resolution = 'YES' then 1
              when resolution = 'NO' then 0
              when resolution = 'MKT' then resolution_probability
              else null end as res_prob
      from contracts
      where mechanism = 'cpmm-1'
      and id = any($1)
      `,
      [contractIds],
      (r) => [
        r.id as string,
        {
          resTime: r.res_time != null ? Date.parse(r.res_time as string) : null,
          resProb: r.res_prob != null ? parseFloat(r.res_prob as string) : null,
          poolProb: parseFloat(r.pool_prob),
        },
      ]
    )
  )
}

const getBetProbsAt = async (
  pg: SupabaseDirectClient,
  when: number,
  contractIds: string[]
) => {
  return Object.fromEntries(
    await pg.map(
      `with probs_before as (
        select distinct on (contract_id, answer_id)
          contract_id, answer_id, prob_after as prob
        from contract_bets
        where created_time < millis_to_ts($1)
        and contract_id = any($2) 
        order by contract_id, answer_id, created_time desc
      ), probs_after as (
        select distinct on (contract_id, answer_id)
          contract_id, answer_id, prob_before as prob
        from contract_bets
        where created_time >= millis_to_ts($1)
        and contract_id = any($2)
        order by contract_id, answer_id, created_time
      )
      select
        coalesce(pa.contract_id, pb.contract_id) as contract_id,
        coalesce(pa.answer_id, pb.answer_id) as answer_id,
        coalesce(pa.prob, pb.prob) as prob
      from probs_after as pa
      full outer join probs_before as pb
        on pa.contract_id = pb.contract_id and pa.answer_id = pb.answer_id
      `,
      [when, contractIds],
      (r) => [
        `${r.contract_id} ${r.answer_id ?? '_'}`,
        parseFloat(r.prob as string),
      ]
    )
  )
}
