import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from './contract'
import { LiquidityProvision } from './liquidity-provision'
import { removeUndefinedProps } from './util/object'

export const getNewLiquidityProvision = (
  userId: string,
  amount: number,
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract,
  answerId?: string
) => {
  let pool: { [outcome: string]: number } | undefined
  if (contract.mechanism === 'cpmm-1') {
    pool = contract.pool
  }

  const newLiquidityProvision: Omit<LiquidityProvision, 'id'> =
    removeUndefinedProps({
      userId: userId,
      contractId: contract.id,
      answerId,
      amount,
      pool,
      createdTime: Date.now(),
    })

  return newLiquidityProvision
}
