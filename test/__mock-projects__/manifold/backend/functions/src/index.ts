import * as admin from 'firebase-admin'

admin.initializeApp()

// scheduled functions
export {
  sendWeeklyPortfolioUpdate,
  saveWeeklyContractMetrics,
} from './scheduled/weekly-portfolio-updates'
export * from './scheduled/reset-betting-streaks'
export * from './scheduled/drizzle-liquidity'
export * from './scheduled/reset-quests-stats'
