// Auto top-up functionality
export {
  checkAndTriggerAutoTopup,
  validateAutoTopupStatus,
  type AutoTopupValidationResult,
} from './auto-topup'

// Balance calculation
export {
  calculateUsageAndBalance,
  consumeCredits,
  calculateUsageThisCycle,
  type CreditBalance,
  type CreditUsageAndBalance,
  type CreditConsumptionResult,
} from './balance-calculator'

// Credit grant operations
export {
  triggerMonthlyResetAndGrant,
  processAndGrantCredit,
  revokeGrantByOperationId,
  getPreviousFreeGrantAmount,
  calculateTotalReferralBonus,
  grantCreditOperation,
} from './grant-credits'

// Credit conversion utilities
export {
  convertCreditsToUsdCents,
  getUserCostPerCredit,
  convertStripeGrantAmountToCredits,
} from './conversion'

// Utilities
export { generateOperationIdTimestamp } from './utils'

// Constants
export { CREDITS_USAGE_LIMITS } from './constants'