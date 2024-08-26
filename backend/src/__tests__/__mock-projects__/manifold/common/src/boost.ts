// number normal markets to show between boosted markets
import { Contract } from 'common/contract'

export const AD_PERIOD = 5

export const AD_WAIT_SECONDS = 4 // Time with ad visible before allowing the user to claim.

export const AD_RATE_LIMIT = 10 * 1000 // 10 seconds

// cost in mana
export const DEFAULT_AD_COST_PER_VIEW = 100
export const MIN_AD_COST_PER_VIEW = 100
export const AD_REDEEM_REWARD = 30

export type adContract = {
  contract: Contract
  adId: string
}
