import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'

export type ChartPosition = {
  color: string | undefined
  id: string
  amount: number
  direction: number
  shares: number
  orderAmount: number
  createdTime: number
  probAfter: number
  probBefore: number
  userId: string
  answerId: string | undefined
  outcome: string
  bets: Bet[]
  contract: Contract
  contractMetric: ContractMetric
}
