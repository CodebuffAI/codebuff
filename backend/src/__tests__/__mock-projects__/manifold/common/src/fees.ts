import { addObjects } from 'common/util/object'

export const FEE_START_TIME = 1713292320000

const TAKER_FEE_CONSTANT = 0.07
export const getTakerFee = (shares: number, prob: number) => {
  return TAKER_FEE_CONSTANT * prob * (1 - prob) * shares
}

const CREATORS_EARN_WHOLE_FEE_UP_TO = 1000
export const getFeesSplit = (
  totalFees: number,
  previouslyCollectedFees: Fees
) => {
  const before1k = Math.max(
    0,
    CREATORS_EARN_WHOLE_FEE_UP_TO - previouslyCollectedFees.creatorFee
  )
  const allToCreatorAmount = Math.min(totalFees, before1k)
  const splitWithCreatorAmount = totalFees - allToCreatorAmount
  return {
    creatorFee: allToCreatorAmount + splitWithCreatorAmount * 0.5,
    platformFee: splitWithCreatorAmount * 0.5,
    liquidityFee: 0,
  }
}

export const FLAT_TRADE_FEE = 0.1
export const FLAT_COMMENT_FEE = 1

export const DPM_PLATFORM_FEE = 0.0
export const DPM_CREATOR_FEE = 0.0
export const DPM_FEES = DPM_PLATFORM_FEE + DPM_CREATOR_FEE

export type Fees = {
  creatorFee: number
  platformFee: number
  liquidityFee: number
}

export const noFees: Fees = {
  creatorFee: 0,
  platformFee: 0,
  liquidityFee: 0,
}

export const getFeeTotal = (fees: Fees) => {
  return fees.creatorFee + fees.platformFee + fees.liquidityFee
}

export const sumAllFees = (fees: Fees[]) => {
  let totalFees = noFees
  fees.forEach((totalFee) => (totalFees = addObjects(totalFees, totalFee)))
  return getFeeTotal(totalFees)
}
