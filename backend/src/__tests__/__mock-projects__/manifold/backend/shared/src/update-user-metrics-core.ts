import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getUsers, log, revalidateStaticProps } from 'shared/utils'
import { chunk, groupBy, sortBy, sumBy, uniq } from 'lodash'
import { Contract, CPMMMultiContract } from 'common/contract'
import {
  calculateMetricsByContractAndAnswer,
  calculateNewPortfolioMetrics,
} from 'common/calculate-metrics'
import { getUserLoanUpdates, isUserEligibleForLoan } from 'common/loans'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import { buildArray } from 'common/util/array'
import {
  hasChanges,
  hasSignificantDeepChanges,
  removeUndefinedProps,
} from 'common/util/object'
import { Bet } from 'common/bet'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { getAnswersForContractsDirect } from 'shared/supabase/answers'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { convertBet } from 'common/supabase/bets'
import { ContractMetric } from 'common/contract-metric'
import { Row } from 'common/supabase/utils'
import { BOT_USERNAMES } from 'common/envs/constants'
import { bulkInsert, bulkUpdate } from 'shared/supabase/utils'
import { type User } from 'common/user'

const userToPortfolioMetrics: {
  [userId: string]: {
    currentPortfolio: PortfolioMetrics | undefined
    dayAgoProfit: number | undefined
    weekAgoProfit: number | undefined
    timeCachedPeriodProfits: number
  }
} = {}
const LIMIT = 400
export async function updateUserMetricsCore(
  userIds?: string[],
  since?: number
) {
  const useSince = since !== undefined
  const now = Date.now()
  const yesterday = now - DAY_MS
  const weekAgo = now - DAY_MS * 7
  const pg = createSupabaseDirectClient()

  log('Loading active users...')
  const random = Math.random()
  const activeUserIds = userIds?.length
    ? userIds
    : await pg.map(
        `
      select distinct users.id, uph.last_calculated
      from users
        left join user_portfolio_history_latest uph on uph.user_id = users.id
      where (
       users.id in (
           select distinct user_id from user_contract_interactions
           where created_time > now() - interval '2 weeks'
       ) or
       users.id in (
           select id from users where username in ($2:list) and
           (users.data -> 'lastBetTime')::bigint > ts_to_millis(now() - interval '2 weeks')
        ) or
       ($1 < 0.05 and id in (
           select distinct users.id from users
            join user_contract_metrics on users.id = user_contract_metrics.user_id
            join contracts on user_contract_metrics.contract_id = contracts.id
             where contracts.resolution_time is null
             and user_contract_metrics.has_shares = true
           ))
       )
        order by uph.last_calculated nulls first limit $3`,
        [random, BOT_USERNAMES, LIMIT],
        (r) => r.id as string
      )

  log(`Loaded ${activeUserIds.length} active users.`)

  const userIdsNeedingUpdate = activeUserIds.filter(
    (id) =>
      !userToPortfolioMetrics[id]?.currentPortfolio ||
      (userToPortfolioMetrics[id]?.timeCachedPeriodProfits ?? 0) <
        now - 6 * HOUR_MS
  )

  if (userIdsNeedingUpdate.length > 0) {
    log(
      `Fetching portfolio metrics for ${
        userIdsNeedingUpdate.length
      } users. Already have metrics for ${
        Object.keys(userToPortfolioMetrics).length
      } users.`
    )
    const userIdsMissingPortfolio = activeUserIds.filter(
      (id) => !userToPortfolioMetrics[id]?.currentPortfolio
    )
    log(
      `Loading current portfolio snapshot for ${userIdsMissingPortfolio.length} users...`
    )
    // We recalculate the portfolio every run per user, so we don't need to ever query it more than once
    const currentPortfolios = await getPortfolioSnapshot(
      pg,
      userIdsMissingPortfolio
    )
    log(`Loaded current portfolio snapshot.`)

    log('Loading historical profits...')
    const [dayAgoProfits, weekAgoProfits] = await Promise.all(
      [yesterday, weekAgo].map((t) =>
        getPortfolioHistoricalProfits(pg, userIdsNeedingUpdate, t)
      )
    )
    log(`Loaded historical profits.`)
    for (const userId of userIdsNeedingUpdate) {
      userToPortfolioMetrics[userId] = {
        currentPortfolio:
          currentPortfolios[userId] ??
          userToPortfolioMetrics[userId]?.currentPortfolio,
        dayAgoProfit: dayAgoProfits[userId]?.mana,
        weekAgoProfit: weekAgoProfits[userId]?.mana,
        // TODO: cash profits
        timeCachedPeriodProfits: Date.now(),
      }
    }
  }

  log('Loading bets...')

  // We need to update metrics for contracts that resolved up through a week ago,
  // so we can calculate the daily/weekly profit on them
  const metricRelevantBets = await getUnresolvedOrRecentlyResolvedBets(
    pg,
    activeUserIds,
    useSince ? since : weekAgo
  )
  log(
    `Loaded ${sumBy(
      Object.values(metricRelevantBets),
      (bets) => bets.length
    )} bets.`
  )

  log('Loading contracts...')
  const allBets = Object.values(metricRelevantBets).flat()
  const contracts = await getRelevantContracts(pg, allBets)
  log('Loading answers...')
  const answersByContractId = await getAnswersForContractsDirect(
    pg,
    contracts.filter((c) => c.mechanism === 'cpmm-multi-1').map((c) => c.id)
  )
  log(`Loaded ${contracts.length} contracts and their answers.`)

  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))

  for (const [contractId, answers] of Object.entries(answersByContractId)) {
    // Denormalize answers onto the contract.
    // eslint-disable-next-line no-extra-semi
    ;(contractsById[contractId] as CPMMMultiContract).answers = answers
  }

  log('Loading current contract metrics...')
  const currentContractMetrics = await pg.map(
    `select data from user_contract_metrics
            where user_id in ($1:list)
            and contract_id in ($2:list)
            `,
    [activeUserIds, contracts.map((c) => c.id)],
    (r) => r.data as ContractMetric
  )
  log(`Loaded ${currentContractMetrics.length} current contract metrics.`)

  const currentMetricsByUserId = groupBy(
    currentContractMetrics,
    (m) => m.userId
  )

  const userUpdates: User[] = []
  const portfolioUpdates = [] as Omit<Row<'user_portfolio_history'>, 'id'>[]
  const contractMetricUpdates = []

  log('Loading user balances & deposit information...')
  // Load user data right before calculating metrics to avoid out-of-date deposit/balance data (esp. for new users that
  // get their first 9 deposits upon visiting new markets).
  const users = await getUsers(activeUserIds)
  log('Computing metric updates...')
  for (const user of users) {
    const userMetricRelevantBets = metricRelevantBets[user.id] ?? []
    const { currentPortfolio } = userToPortfolioMetrics[user.id]
    const unresolvedBetsOnly = userMetricRelevantBets.filter((b) => {
      if (contractsById[b.contractId].isResolved) return false
      if (b.answerId === 'undefined' || !b.answerId) {
        return !contractsById[b.contractId].resolution
      }
      const answers = answersByContractId[b.contractId]
      if (b.answerId && answers) {
        const answer = answers.find((a) => a.id === b.answerId)
        if (!answer) {
          log(
            `Answer not found for contract ${b.contractId}, answer ${b.answerId}, bet ${b.id}`
          )
          // We're assuming if there's no answer found, it's not resolved
          return true
        }
        // sum to one answers are resolved when the contract is resolved
        // indie answers are resolved when they have a resolution time
        return !answer.resolutionTime
      } else if (b.answerId && !answers) {
        log(
          `No answers found for contract ${b.contractId}, answer ${b.answerId}, bet ${b.id}`
        )
      }
      return !contractsById[b.contractId].resolution
    })
    const newPortfolio = {
      ...calculateNewPortfolioMetrics(user, contractsById, unresolvedBetsOnly),
      profit: 0,
    }
    const metricRelevantBetsByContract = groupBy(
      userMetricRelevantBets,
      (b) => b.contractId
    )
    const freshMetrics = calculateMetricsByContractAndAnswer(
      metricRelevantBetsByContract,
      contractsById,
      user,
      answersByContractId
    ).flat()
    const currentMetricsForUser = currentMetricsByUserId[user.id] ?? []
    contractMetricUpdates.push(
      ...freshMetrics.filter((freshMetric) => {
        const currentMetric = currentMetricsForUser.find(
          (m) =>
            freshMetric.contractId === m.contractId &&
            freshMetric.answerId === m.answerId
        )
        if (!currentMetric) return true
        return hasSignificantDeepChanges(currentMetric, freshMetric, 0.1)
      })
    )

    const { balance, investmentValue, totalDeposits } = newPortfolio
    const allTimeProfit = balance + investmentValue - totalDeposits
    const unresolvedMetrics = freshMetrics.filter((m) => {
      const contract = contractsById[m.contractId]
      if (contract.mechanism === 'cpmm-multi-1') {
        // Don't double count null answer (summary) profits
        if (!m.answerId) return false
        const answer = answersByContractId[m.contractId]?.find(
          (a) => a.id === m.answerId
        )
        return !answer?.resolutionTime
      }
      return !contract.isResolved
    })
    let resolvedProfitAdjustment = user.resolvedProfitAdjustment ?? 0
    if (since === 0) {
      const resolvedMetrics = freshMetrics.filter((m) => {
        const contract = contractsById[m.contractId]
        if (contract.mechanism === 'cpmm-multi-1') {
          // Don't double count null answer (summary) profits
          if (!m.answerId) return false
          const answer = answersByContractId[m.contractId]?.find(
            (a) => a.id === m.answerId
          )
          return !!answer?.resolutionTime
        }
        return contract.isResolved
      })
      resolvedProfitAdjustment = sumBy(
        resolvedMetrics,
        (m) => m.profitAdjustment ?? 0
      )
      await pg.none(
        `update users
         set resolved_profit_adjustment = $1
         where id = $2`,
        [resolvedProfitAdjustment, user.id]
      )
    }
    const leaderBoardProfit =
      resolvedProfitAdjustment +
      // Resolved profits are already included in the user's balance - deposits
      sumBy(unresolvedMetrics, (m) => (m.profitAdjustment ?? 0) + m.profit) +
      allTimeProfit
    newPortfolio.profit = leaderBoardProfit

    const didPortfolioChange =
      currentPortfolio === undefined ||
      currentPortfolio.balance !== newPortfolio.balance ||
      currentPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
      currentPortfolio.investmentValue !== newPortfolio.investmentValue ||
      currentPortfolio.loanTotal !== newPortfolio.loanTotal ||
      currentPortfolio.spiceBalance !== newPortfolio.spiceBalance ||
      currentPortfolio.profit !== leaderBoardProfit

    const newProfit = {
      daily:
        allTimeProfit -
        (userToPortfolioMetrics[user.id].dayAgoProfit ?? allTimeProfit),
      weekly:
        allTimeProfit -
        (userToPortfolioMetrics[user.id].weekAgoProfit ?? allTimeProfit),
      monthly: 0,
      allTime: allTimeProfit,
    }

    const nextLoanPayout = isUserEligibleForLoan(newPortfolio)
      ? getUserLoanUpdates(metricRelevantBetsByContract, contractsById).payout
      : 0

    if (didPortfolioChange) {
      portfolioUpdates.push({
        user_id: user.id,
        ts: new Date(newPortfolio.timestamp).toISOString(),
        investment_value: newPortfolio.investmentValue,
        cash_investment_value: newPortfolio.cashInvestmentValue,
        balance: newPortfolio.balance,
        spice_balance: newPortfolio.spiceBalance,
        cash_balance: newPortfolio.cashBalance,
        total_deposits: newPortfolio.totalDeposits,
        total_cash_deposits: newPortfolio.totalCashDeposits,
        loan_total: newPortfolio.loanTotal,
        profit: leaderBoardProfit,
      })
      userToPortfolioMetrics[user.id].currentPortfolio = newPortfolio
    }

    if (
      hasChanges(user, {
        profitCached: newProfit,
        nextLoanCached: nextLoanPayout,
      })
    ) {
      userUpdates.push({
        ...user,
        profitCached: newProfit,
        nextLoanCached: nextLoanPayout,
      })
    }
  }
  log(`Computed ${contractMetricUpdates.length} metric updates.`)

  const userIdsNotWritten = activeUserIds.filter(
    (id) => !portfolioUpdates.some((p) => p.user_id === id)
  )
  const userUpdateChunks = chunk(userUpdates, LIMIT / 10)
  log('Writing updates and inserts...')
  await Promise.all(
    buildArray(
      contractMetricUpdates.length > 0 &&
        bulkUpdateContractMetrics(contractMetricUpdates)
          .catch((e) => log.error('Error upserting contract metrics', e))
          .then(() => log('Finished updating contract metrics.')),
      portfolioUpdates.length > 0 &&
        bulkInsert(pg, 'user_portfolio_history', portfolioUpdates)
          .catch((e) => log.error('Error inserting user portfolio history', e))
          .then(() =>
            log('Finished creating Supabase portfolio history entries...')
          ),
      userIdsNotWritten.length > 0 &&
        pg.query(
          `update user_portfolio_history_latest set last_calculated = $1 where user_id in ($2:list)`,
          [new Date(now).toISOString(), userIdsNotWritten]
        ),

      Promise.all(
        userUpdateChunks.map(async (chunk) =>
          bulkUpdate(
            pg,
            'users',
            ['id'],
            chunk.map((u) => ({
              id: u.id,
              data: `${JSON.stringify(removeUndefinedProps(u))}::jsonb`,
            })),
            5 * MINUTE_MS
          )
        )
      )
        .catch((e) => log.error('Error writing user updates', e))
        .then(() => log('Finished user updates.'))
    )
  )

  await revalidateStaticProps('/leaderboards')

  log('Done.')
}

const getRelevantContracts = async (pg: SupabaseDirectClient, bets: Bet[]) => {
  const betContractIds = uniq(bets.map((b) => b.contractId))
  // TODO shoud remove extraneous data from this
  return await pg.map(
    `select data from contracts where id in ($1:list)`,
    [betContractIds],
    (r) => r.data as Contract
  )
}

const getUnresolvedOrRecentlyResolvedBets = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number
) => {
  const bets = await pg.map(
    `
    select cb.amount, cb.shares, cb.outcome, cb.loan_amount, cb.user_id, cb.answer_id, cb.contract_id, cb.created_time, cb.is_redemption
    from contract_bets as cb
    join contracts as c on cb.contract_id = c.id
    left join answers as a on cb.answer_id = a.id
    where
      cb.user_id in ($1:list)
      and (c.resolution_time is null or c.resolution_time > $2)
      and (a is null or a.resolution_time is null or a.resolution_time > $2)
    `,
    [userIds, new Date(since).toISOString()],
    convertBet
  )

  return groupBy(
    sortBy(bets, (b) => b.createdTime),
    (r) => r.userId as string
  )
}

const getPortfolioSnapshot = async (
  pg: SupabaseDirectClient,
  userIds: string[]
) => {
  if (userIds.length === 0) {
    return {}
  }
  return Object.fromEntries(
    await pg.map(
      `select *
      from user_portfolio_history_latest
      where user_id in ($1:list)
      order by user_id, ts desc`,
      [userIds],
      (r) => [r.user_id as string, convertPortfolioHistory(r)]
    )
  )
}

const getPortfolioHistoricalProfits = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  when: number
) => {
  // We don't load the leaderboard profit here bc these numbers are used for comparing to the daily/weekly profit from contract metrics
  return Object.fromEntries(
    await pg.map(
      `select distinct on (user_id) user_id,
        spice_balance + investment_value + balance - total_deposits as profit,
        cash_balance - total_cash_deposits as cash_profit
      from user_portfolio_history
      where ts < $2 and user_id in ($1:list)
      order by user_id, ts desc`,
      [userIds, new Date(when).toISOString()],
      (r) => [
        r.user_id as string,
        {
          mana: parseFloat(r.profit as string),
          cash: parseFloat(r.cash_profit as string),
        },
      ]
    )
  )
}
