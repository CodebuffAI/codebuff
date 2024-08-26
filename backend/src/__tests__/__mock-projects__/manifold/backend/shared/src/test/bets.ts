import { Contract } from 'common/contract'
import { removeUndefinedProps } from 'common/util/object'

export const getRandomTestBet = (
  contract: Contract,
  enableLimitOrders: boolean,
  chanceOfNo?: number
) => {
  const limitProb = !enableLimitOrders
    ? undefined
    : Math.random() > 0.5
    ? parseFloat(Math.random().toPrecision(1))
    : undefined

  return removeUndefinedProps({
    contractId: contract.id,
    amount: Math.random() * 100 + 1,
    outcome:
      Math.random() > (chanceOfNo ?? 0.5) ? ('YES' as const) : ('NO' as const),
    answerId:
      contract.mechanism === 'cpmm-multi-1'
        ? contract.answers[Math.floor(Math.random() * contract.answers.length)]
            ?.id
        : undefined,
    limitProb: !limitProb
      ? undefined
      : limitProb < 0.01
      ? 0.01
      : limitProb > 0.99
      ? 0.99
      : limitProb,
    deterministic: true,
  })
}
