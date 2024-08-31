import { CPMMContract, CPMMMultiContract } from 'common/contract'
import { getPrivateUsersNotSent, isProd, log } from 'shared/utils'
import { filterDefined } from 'common/util/array'
import { DAY_MS } from 'common/util/time'
import { partition, sortBy, sum, uniq } from 'lodash'
import {
  PerContractInvestmentsData,
  OverallPerformanceData,
  emailMoneyFormat,
  getWeeklyPortfolioUpdateEmail,
  sendBulkEmails,
  EmailAndTemplateEntry,
} from 'shared/emails'
import { contractUrl } from 'shared/utils'
import { getUsersContractMetricsOrderedByProfit } from 'common/supabase/contract-metrics'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { DIVISION_NAMES } from 'common/leagues'
import * as numeral from 'numeral'
import { getContractsDirect } from 'shared/supabase/contracts'

const USERS_TO_EMAIL = 1000
const WEEKLY_MOVERS_TO_SEND = 6

// Run every minute on Friday for 3 hours starting at 12pm PT.
// This should work until we have at least ~180k users (1000 * 180)
export async function sendPortfolioUpdateEmailsToAllUsers() {
  const pg = createSupabaseDirectClient()
  if (!isProd()) return

  const privateUsers = await getPrivateUsersNotSent(
    'profit_loss_updates',
    USERS_TO_EMAIL,
    pg
  )

  await pg.none(
    `update private_users set weekly_portfolio_email_sent = true where id = any($1)`,
    [privateUsers.map((u) => u.id)]
  )

  if (privateUsers.length === 0) {
    log('No users to send trending markets emails to')
    return
  }

  log('Sending weekly portfolio emails to', privateUsers.length, 'users')

  const db = createSupabaseClient()

  const userIds = privateUsers.map((user) => user.id)

  const usersToContractsCreated = {} as { [userId: string]: number }
  await pg.map(
    `select creator_id, count(*) as count
    from contracts
    where creator_id = any($1) and created_time >= now() - interval '7 days'
    group by creator_id`,
    [userIds],
    (r) => (usersToContractsCreated[r.creator_id] = r.count)
  )

  const contractBetCountInLastWeek = {} as { [userId: string]: number }
  await pg.map(
    `select user_id, count(*) as count
    from user_contract_metrics
    where user_id = any($1) and answer_id is null and (data->'lastBetTime')::bigint >= ts_to_millis(now() - interval '7 days')
    group by user_id`,
    [userIds],
    (r) => (contractBetCountInLastWeek[r.user_id] = r.count)
  )

  // Get count of likes the users received over the past week
  const usersToLikesReceived: { [userId: string]: number } = {}
  await pg.map(
    `select content_owner_id, count(*) as count
    from user_reactions
    where created_time >= now() - interval '7 days' and content_owner_id = any($1)
    group by content_owner_id`,
    [userIds],
    (r) => (usersToLikesReceived[r.content_owner_id] = r.count)
  )

  const usersToLeagueStats = {} as { [userId: string]: string | null }
  await pg.map(
    `select distinct on (user_id) * from user_league_info
       where user_id = any($1)
       order by user_id, created_time desc;`,
    [userIds],
    (r) =>
      (usersToLeagueStats[r.user_id] = r
        ? numeral(r.rank).format('0o') + ' in ' + DIVISION_NAMES[r.division]
        : null)
  )
  // TODO: use their saved weekly portfolio update object from weekly-portfolio-updates.ts
  const usersToContractMetrics = await getUsersContractMetricsOrderedByProfit(
    userIds,
    db,
    'week'
  )
  const allWeeklyMoversContracts = await getContractsDirect(
    uniq(
      Object.values(usersToContractMetrics).flatMap((cms) =>
        cms.map((cm) => cm.contractId)
      )
    ),
    pg
  )
  const bulkEmails: EmailAndTemplateEntry[] = []
  privateUsers.forEach((privateUser) => {
    // Don't send to a user unless they're over 5 days old
    if (privateUser.createdTime > Date.now() - 5 * DAY_MS) return

    // Compute fun auxiliary stats
    const totalContractsUserBetOnInLastWeek =
      contractBetCountInLastWeek[privateUser.id] ?? 0
    const greenBg = 'rgba(0,160,0,0.2)'
    const redBg = 'rgba(160,0,0,0.2)'
    const clearBg = 'rgba(255,255,255,0)'
    const usersMetrics = usersToContractMetrics[privateUser.id]
    const profit = sum(usersMetrics.map((cm) => cm.from?.week.profit ?? 0))
    const roundedProfit = Math.round(profit) === 0 ? 0 : Math.floor(profit)
    const marketsCreated = usersToContractsCreated?.[privateUser.id] ?? 0
    const performanceData = {
      profit: emailMoneyFormat(profit),
      profit_style: `background-color: ${
        roundedProfit > 0 ? greenBg : roundedProfit === 0 ? clearBg : redBg
      }`,
      markets_created: marketsCreated.toString(),
      likes_received: (usersToLikesReceived[privateUser.id] ?? 0).toString(),
      unique_bettors: privateUser.weeklyTraders.toString(),
      markets_traded: totalContractsUserBetOnInLastWeek.toString(),
      prediction_streak: privateUser.currentBettingStreak.toString() + ' days',
      league_rank: usersToLeagueStats[privateUser.id] ?? 'Unranked',
    } as OverallPerformanceData

    const weeklyMoverContracts = filterDefined(
      usersToContractMetrics[privateUser.id]
        .map((cm) => cm.contractId)
        .map((contractId) =>
          allWeeklyMoversContracts.find((c) => c.id === contractId)
        )
    )

    // Compute weekly movers stats
    const investmentValueDifferences = sortBy(
      filterDefined(
        weeklyMoverContracts.map((contract) => {
          const cpmmContract = contract as CPMMContract | CPMMMultiContract

          const cm = usersToContractMetrics[privateUser.id].filter(
            (cm) => cm.contractId === contract.id
          )[0]
          if (!cm || !cm.from) return undefined
          const fromWeek = cm.from.week
          const profit = fromWeek.profit
          const currentValue = cm.payout
          const { resolution, mechanism } = cpmmContract
          const resolutionTitle =
            mechanism === 'cpmm-multi-1' &&
            resolution &&
            cpmmContract.shouldAnswersSumToOne
              ? cpmmContract.answers.find((a) => a.id === resolution)?.text
              : resolution
          return {
            currentValue,
            pastValue: fromWeek.prevValue,
            profit,
            contractSlug: contract.slug,
            questionTitle: contract.question,
            questionUrl: contractUrl(contract),
            questionProb:
              resolutionTitle && resolutionTitle !== 'MKT'
                ? resolutionTitle.length > 7
                  ? resolutionTitle.slice(0, 5) + '...'
                  : resolutionTitle
                : mechanism === 'cpmm-1'
                ? Math.round(cpmmContract.prob * 100) + '%'
                : '',
            profitStyle: `color: ${
              profit > 0 ? 'rgba(0,160,0,1)' : '#a80000'
            };`,
          } as PerContractInvestmentsData
        })
      ),
      (differences) => Math.abs(differences.profit)
    ).reverse()

    // Don't show markets with abs profit < 1
    const [winningInvestments, losingInvestments] = partition(
      investmentValueDifferences.filter((diff) => Math.abs(diff.profit) > 1),
      (investmentsData: PerContractInvestmentsData) => {
        return investmentsData.profit > 0
      }
    )
    // Pick 3 winning investments and 3 losing investments
    const topInvestments = winningInvestments.slice(0, 3)
    const worstInvestments = losingInvestments.slice(0, 3)
    // If no bets in the last week ANd no market movers AND no markets created, don't send email
    if (
      totalContractsUserBetOnInLastWeek === 0 &&
      topInvestments.length === 0 &&
      worstInvestments.length === 0 &&
      marketsCreated === 0
    ) {
      return
    }
    const email = getWeeklyPortfolioUpdateEmail(
      privateUser.name,
      privateUser,
      topInvestments.concat(worstInvestments) as PerContractInvestmentsData[],
      performanceData,
      WEEKLY_MOVERS_TO_SEND
    )
    if (email) {
      bulkEmails.push(email)
    }
  })
  await sendBulkEmails(
    `Here's your weekly portfolio update!`,
    'portfolio-update-bulk',
    bulkEmails
  )
  log(`Portfolio emails sent: ${bulkEmails}`)
}
