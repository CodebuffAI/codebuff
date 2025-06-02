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
  getOrderedActiveOrgGrants,
  calculateOrganizationUsageAndBalance,
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
  grantOrganizationCredits,
} from './grant-credits'

// Credit conversion utilities
export { getUserCostPerCredit } from './conversion'

// Utilities
export { generateOperationIdTimestamp } from './utils'

// New exports for Step 7
export { getOrganizationAlerts } from './alerts';
export { validateAndNormalizeRepositoryUrl } from './repositories';
export { syncOrganizationBillingCycle } from './billing-cycle';
