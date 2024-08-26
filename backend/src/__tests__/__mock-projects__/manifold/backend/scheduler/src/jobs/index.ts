import { createJob } from './helpers'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'
import { sendOnboardingNotificationsInternal } from 'shared/onboarding-helpers'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { updateGroupMetricsCore } from 'shared/update-group-metrics-core'
import { cleanOldNotifications } from './clean-old-notifications'
import { updateStatsCore } from './update-stats'
import { calculateConversionScore } from 'shared/conversion-score'
import { autoAwardBounty } from './auto-award-bounty'
import { resetPgStats } from './reset-pg-stats'
import { calculateUserTopicInterests } from 'shared/calculate-user-topic-interests'
import {
  CREATOR_UPDATE_FREQUENCY,
  updateCreatorMetricsCore,
} from 'shared/update-creator-metrics-core'
import { sendPortfolioUpdateEmailsToAllUsers } from 'shared/weekly-portfolio-emails'
import { sendWeeklyMarketsEmails } from 'shared/weekly-markets-emails'
import { resetWeeklyEmailsFlags } from './reset-weekly-emails-flags'
import { calculateGroupImportanceScore } from 'shared/group-importance-score'
import { checkPushNotificationReceipts } from 'shared/check-push-receipts'
import { sendStreakExpirationNotification } from './streak-expiration-notice'
import { expireLimitOrders } from 'shared/expire-limit-orders'
import { denormalizeAnswers } from './denormalize-answers'
import { incrementStreakForgiveness } from './increment-streak-forgiveness'
import { sendMarketCloseEmails } from './send-market-close-emails'
import { pollPollResolutions } from './poll-poll-resolutions'
import { IMPORTANCE_MINUTE_INTERVAL } from 'shared/importance-score'
import { scoreContracts } from './score-contracts'
import { updateLeagueRanks } from './update-league-ranks'
import { updateLeague } from './update-league'
import { updateViewsAndViewersEmbeddings } from 'shared/helpers/embeddings'

export function createJobs() {
  return [
    // Hourly jobs:
    createJob(
      'send-market-close-emails',
      '0 0 * * * *', // every hour
      sendMarketCloseEmails
    ),
    createJob(
      'update-contract-metrics',
      '0 */21 * * * *', // every 21 minutes - (on the 3rd minute of every hour)
      updateContractMetricsCore
    ),
    createJob(
      'update-creator-metrics',
      `0 */${CREATOR_UPDATE_FREQUENCY} * * * *`, // every 13 minutes - (on the 5th minute of every hour)
      updateCreatorMetricsCore
    ),
    createJob(
      'group-importance-score',
      '0 6 * * * *', // on the 6th minute of every hour
      () => calculateGroupImportanceScore()
    ),
    createJob(
      'update-league',
      '0 */15 * * * *', // every 15 minutes
      updateLeague
    ),
    createJob(
      'update-group-metrics',
      '0 */17 * * * *', // every 17 minutes - (on the 8th minute of every hour)
      updateGroupMetricsCore
    ),
    createJob(
      'check-push-receipts',
      '0 15 * * * *', // on the 15th minute of every hour
      checkPushNotificationReceipts
    ),
    createJob(
      'calculate-conversion-scores',
      '0 46 * * * *', // on the 46th minute of every hour
      calculateConversionScore
    ),
    createJob(
      'auto-award-bounty',
      '0 55 * * * *', // on the 55th minute of every hour
      autoAwardBounty
    ),
    createJob(
      'update-user-metrics',
      '0 * * * * *', // every minute
      () => updateUserMetricsCore()
    ),
    createJob(
      'expire-limit-orders',
      '0 */10 * * * *', // every 10 minutes
      expireLimitOrders
    ),
    createJob(
      'score-contracts',
      `0 */${IMPORTANCE_MINUTE_INTERVAL} * * * *`, // every 2 minutes
      scoreContracts
    ),
    createJob(
      'denormalize-answers',
      '0 */1 * * * *', // every minute
      denormalizeAnswers
    ),
    createJob(
      'poll-poll-resolutions',
      '0 */1 * * * *', // every minute
      pollPollResolutions
    ),
    // Daily jobs:
    createJob(
      'clean-old-notifications',
      '0 30 2 * * *', // 230 AM daily
      cleanOldNotifications
    ),
    createJob(
      'reset-pg-stats',
      '0 0 3 * * *', // 3 AM daily
      resetPgStats
    ),
    createJob(
      'calculate-user-topic-interests',
      '0 0 3 * * *', // 3 AM daily
      () => calculateUserTopicInterests()
    ),
    createJob(
      'update-stats',
      '0 20 4 * * *', // on 4:20am daily
      () => updateStatsCore(7)
    ),
    createJob(
      'onboarding-notification',
      '0 0 11 * * *', // 11 AM daily
      sendOnboardingNotificationsInternal
    ),
    createJob(
      'weekly-portfolio-emails',
      '0 * 12-14 * * 5',
      sendPortfolioUpdateEmailsToAllUsers
    ),
    createJob(
      'weekly-markets-emails',
      '0 */3 11-17 * * 1',
      sendWeeklyMarketsEmails
    ),
    createJob(
      'reset-weekly-email-flags',
      '0 0 0 * * 6',
      resetWeeklyEmailsFlags
    ),
    createJob(
      'send-streak-notifications',
      '0 30 18 * * *', // 6:30pm PST daily ( 9:30pm EST )
      sendStreakExpirationNotification
    ),

    // Monthly jobs:
    createJob(
      'increment-streak-forgiveness',
      '0 0 0 1 * *', // 1st day of the month at 12am PST
      incrementStreakForgiveness
    ),
    createJob(
      'update-league-ranks',
      '0 0 0 * * *', // every day at midnight
      updateLeagueRanks
    ),
    createJob(
      'update-contract-view-embeddings',
      '0 0 0 1 * *', // 1st day of the month
      updateViewsAndViewersEmbeddings
    ),
  ]
}
