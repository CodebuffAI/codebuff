import { Contract } from 'common/contract'
import { useMemo, useState } from 'react'
import { DAY_MS } from 'common/util/time'
import { first, groupBy, last, sumBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import { getAnswerColor } from 'web/components/charts/contract/choice'
import { useBetsOnce } from 'web/hooks/use-bets'
import { DisplayUser } from 'common/api/user-types'
import { ChartPosition } from 'common/chart-position'
import { getContractBetMetrics } from 'common/calculate'

export const useChartPositions = (contract: Contract) => {
  const [displayUser, setDisplayUser] = useState<DisplayUser>()
  const usersBets = useBetsOnce({
    contractId: contract.id,
    userId: displayUser?.id,
    filterRedemptions: true,
    beforeTime: displayUser?.id ? undefined : 1,
    order: 'asc',
  })
  const [hoveredChartPosition, setHoveredChartPosition] =
    useState<ChartPosition | null>(null)

  const chartPositions = useMemo(() => {
    const bucketWidth = DAY_MS
    const startTime = usersBets?.[0]?.createdTime
    if (!startTime) return []
    const buckets = Math.ceil((Date.now() - startTime) / bucketWidth)
    const times = Array.from({ length: buckets }, (_, i) => [
      startTime + i * bucketWidth,
      startTime + (i + 1) * bucketWidth,
    ])
    const betsByAnswer = groupBy(usersBets, 'answerId')
    const answers = 'answers' in contract ? contract.answers : []
    return filterDefined(
      times
        .map((time) => {
          return Object.keys(betsByAnswer).map((answerId) => {
            const bets = betsByAnswer[answerId].filter(
              (bet) => bet.createdTime >= time[0] && bet.createdTime < time[1]
            )
            const a = answers.find((a) => a.id === answerId)
            const color = a ? getAnswerColor(a) : undefined
            const firstBet = first(bets)
            const lastBet = last(bets)
            if (!firstBet || !lastBet) return undefined
            const amount = sumBy(bets, 'amount')
            const contractMetric = getContractBetMetrics(
              contract,
              bets,
              answerId
            )
            return {
              id: firstBet.id,
              amount,
              direction: sumBy(bets, (b) =>
                b.outcome === 'YES' ? b.amount : -b.amount
              ),
              outcome: contractMetric.maxSharesOutcome,
              shares: sumBy(bets, 'shares'),
              orderAmount: sumBy(bets, 'orderAmount'),
              createdTime: lastBet.createdTime,
              probAfter: lastBet.probAfter,
              probBefore: firstBet.probBefore,
              answerId: firstBet.answerId,
              userId: firstBet.userId,
              color,
              bets,
              contract,
              contractMetric,
            } as ChartPosition
          })
        })
        .flat()
    )
  }, [displayUser?.id, usersBets?.length])

  return {
    chartPositions,
    displayUser,
    setDisplayUser,
    hoveredChartPosition,
    setHoveredChartPosition,
  }
}
