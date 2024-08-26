import { BinaryContract, CPMMMultiContract } from './contract'
import { removeUndefinedProps } from './util/object'

export const HOUSE_LIQUIDITY_PROVIDER_ID = 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2' // @ManifoldMarkets' id
export const DEV_HOUSE_LIQUIDITY_PROVIDER_ID = '94YYTk1AFWfbWMpfYcvnnwI1veP2' // @ManifoldMarkets' id

export function getCpmmInitialLiquidity(
  providerId: string,
  contract: BinaryContract | CPMMMultiContract,
  amount: number,
  createdTime: number,
  answerId?: string
) {
  const { mechanism } = contract

  const pool = mechanism === 'cpmm-1' ? { YES: 0, NO: 0 } : undefined

  const lp = removeUndefinedProps({
    userId: providerId,
    contractId: contract.id,
    isAnte: true,
    // Unfortunately, createdTime is only properly set for MC answers after this commit.
    createdTime,
    // answerId is only properly set for MC answers after this commit AND answers added after the question is created.
    answerId,
    amount: amount,
    liquidity: amount,
    pool,
  })

  return lp
}
