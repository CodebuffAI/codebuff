import { chunk, Dictionary, flatMap, groupBy, uniqBy } from 'lodash'
import { Row, run, selectJson, SupabaseClient } from './utils'
import { getContracts } from './contracts'
import { Contract, CPMMContract } from '../contract'
import { ContractMetric } from 'common/contract-metric'

export async function getTopContractMetrics(
  contractId: string,
  limit: number,
  db: SupabaseClient
) {
  const { data } = await run(
    db
      .from('user_contract_metrics')
      .select('data')
      .eq('contract_id', contractId)
      .order('profit', { ascending: false } as any)
      .is('answer_id', null)
      .limit(limit)
  )

  return data ? data.map((doc) => doc.data as ContractMetric) : []
}

export async function getRanking(
  contractId: string,
  profit: number,
  db: SupabaseClient
) {
  const { count } = await run(
    db
      .from('user_contract_metrics')
      .select('*', { count: 'exact' })
      .eq('contract_id', contractId)
      .is('answer_id', null)
      .gt('profit', profit)
  )

  return count + 1
}

export async function getUserContractMetrics(
  userId: string,
  contractId: string,
  db: SupabaseClient,
  answerId?: string
) {
  let q = selectJson(db, 'user_contract_metrics')
    .eq('user_id', userId)
    .eq('contract_id', contractId)

  if (answerId) {
    q = q.eq('answer_id', answerId)
  } else {
    q = q.is('answer_id', null)
  }
  const { data } = await run(q)
  return data.map((r) => r.data) as ContractMetric[]
}

export async function getCPMMContractUserContractMetrics(
  contractId: string,
  limit: number,
  answerId: string | null,
  db: SupabaseClient
) {
  async function fetchOutcomeMetrics(outcome: 'yes' | 'no') {
    const hasSharesColumn = `has_${outcome}_shares`
    const totalSharesColumn = `total_shares_${outcome}`
    let q = db
      .from('user_contract_metrics')
      .select('data')
      .eq('contract_id', contractId)
      .eq(hasSharesColumn, true)
      .order(totalSharesColumn, { ascending: false } as any)
      .limit(limit)
    q = answerId ? q.eq('answer_id', answerId) : q.is('answer_id', null)
    const { data, error } = await q

    if (error) {
      throw error
    }

    return data.map((doc) => doc.data as ContractMetric)
  }

  try {
    const yesMetrics = await fetchOutcomeMetrics('yes')
    const noMetrics = await fetchOutcomeMetrics('no')
    return {
      YES: yesMetrics,
      NO: noMetrics,
    }
  } catch (error) {
    console.error('Error fetching user contract metrics:', error)
    return { YES: [], NO: [] }
  }
}

export async function getUserContractMetricsWithContracts(
  userId: string,
  db: SupabaseClient,
  count = 1000,
  start = 0
) {
  const { data } = await db.rpc('get_contract_metrics_with_contracts', {
    count,
    uid: userId,
    start,
  })
  const metricsByContract = {} as Dictionary<ContractMetric>
  const contracts = [] as Contract[]
  flatMap(data).forEach((d) => {
    metricsByContract[d.contract_id] = d.metrics as ContractMetric
    contracts.push(d.contract as Contract)
  })
  return { metricsByContract, contracts }
}

// To optimize this we should join on the contracts table
export async function getUserContractMetricsByProfitWithContracts(
  userId: string,
  db: SupabaseClient,
  from: 'day' | 'week' | 'month' | 'all',
  limit = 20
) {
  const cms = await getBestAndWorstUserContractMetrics(userId, db, from, limit)
  const contracts = (await getContracts(
    db,
    cms.map((cm) => cm.contractId)
  )) as CPMMContract[]
  return {
    metrics: cms,
    contracts,
  }
}

export async function getBestAndWorstUserContractMetrics(
  userId: string,
  db: SupabaseClient,
  from: 'day' | 'week' | 'month' | 'all',
  limit: number
) {
  const orderString =
    from !== 'all' ? `data->from->${from}->profit` : 'data->profit'
  const { data: negative } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('user_id', userId)
      .is('answer_id', null)
      .order(orderString as any, {
        ascending: true,
      })
      .limit(limit)
  )
  const { data: profit } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('user_id', userId)
      .is('answer_id', null)
      .order(orderString as any, {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit)
  )
  return uniqBy([...profit, ...negative], (d) => d.data.contractId).map(
    (d) => d.data
  ) as ContractMetric[]
}

export async function getUsersContractMetricsOrderedByProfit(
  userIds: string[],
  db: SupabaseClient,
  from: 'day' | 'week' | 'month' | 'all'
) {
  const chunks = chunk(userIds, 100)
  const promises = chunks.map(async (chunk) => {
    const orderString =
      from !== 'all' ? `data->from->${from}->profit` : 'data->profit'
    const { data: negative } = await run(
      selectJson(db, 'user_contract_metrics')
        .in('user_id', chunk)
        .is('answer_id', null)
        .order(orderString as any, {
          ascending: true,
        })
    )
    const { data: profit } = await run(
      selectJson(db, 'user_contract_metrics')
        .in('user_id', chunk)
        .is('answer_id', null)
        .order(orderString as any, {
          ascending: false,
          nullsFirst: false,
        })
    )
    // We want most profitable and least profitable
    return [...profit, ...negative.reverse()].map(
      (d) => d.data
    ) as ContractMetric[]
  })
  const results = await Promise.all(promises)
  const allContractMetrics: { [key: string]: ContractMetric[] } = groupBy(
    flatMap(results),
    'userId'
  )
  userIds.forEach((id) => {
    const myMetrics = allContractMetrics[id] ?? []
    const topAndLowestMetrics = [
      ...myMetrics.slice(0, 5),
      ...myMetrics.slice(-5),
    ]
    allContractMetrics[id] = uniqBy(topAndLowestMetrics, 'contractId')
  })
  return allContractMetrics
}

export async function getContractMetricsForContractIds(
  db: SupabaseClient,
  userId: string,
  contractIds: string[]
) {
  const { data } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('user_id', userId)
      .in('contract_id', contractIds)
      .is('answer_id', null)
  )
  return data.map((d) => d.data) as ContractMetric[]
}

export async function getContractMetricsCount(
  contractId: string,
  db: SupabaseClient,
  outcome?: 'yes' | 'no',
  answerId?: string
) {
  let q = db
    .from('user_contract_metrics')
    .select('*', { head: true, count: 'exact' })
    .eq('contract_id', contractId)
    .eq('has_shares', true)

  q = answerId ? q.eq('answer_id', answerId) : q.is('answer_id', null)

  if (outcome) {
    q = q.eq(`has_${outcome}_shares`, true)
  }
  const { count } = await run(q)

  return count
}
export const convertContractMetricRows = (
  docs: Row<'user_contract_metrics'>[]
) =>
  uniqBy(
    docs.map((doc) => doc.data as ContractMetric),
    (cm) => cm.userId + cm.answerId + cm.contractId
  )

export async function getOrderedContractMetricRowsForContractId(
  contractId: string,
  db: SupabaseClient,
  answerId?: string,
  order: 'profit' | 'shares' = 'profit',
  limit: number = 50
) {
  let q1 = db
    .from('user_contract_metrics')
    .select('*')
    .eq('contract_id', contractId)
    .limit(limit)
  let q2 = db
    .from('user_contract_metrics')
    .select('*')
    .eq('contract_id', contractId)
    .limit(limit)

  if (answerId) {
    q1 = q1.eq('answer_id', answerId)
    q2 = q2.eq('answer_id', answerId)
  } else {
    q1 = q1.is('answer_id', null)
    q2 = q2.is('answer_id', null)
  }

  if (order === 'shares') {
    q1 = q1
      .eq(`has_yes_shares`, true)
      .order(`total_shares_yes`, { ascending: false })
    q2 = q2
      .eq(`has_no_shares`, true)
      .order(`total_shares_no`, { ascending: false })
  } else {
    q1 = q1
      .order(`profit`, { ascending: false, nullsFirst: false })
      .gt(`profit`, 0)
    q2 = q2
      .order(`profit`, { ascending: true, nullsFirst: false })
      .lt(`profit`, 0)
  }
  const { data: q1Data } = await run(q1)
  const { data: q2Data } = await run(q2)
  return q1Data.concat(q2Data)
}
