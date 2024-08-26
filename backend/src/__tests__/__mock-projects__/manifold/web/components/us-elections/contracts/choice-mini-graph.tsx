import { Answer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { HistoryPoint, MultiPoints } from 'common/chart'
import { CPMMMultiContract, CPMMNumericContract } from 'common/contract'
import { scaleLinear, scaleTime } from 'd3-scale'
import { cloneDeep, last } from 'lodash'
import { useMemo } from 'react'
import {
  getAnswerColor,
  useChartAnswers,
} from 'web/components/charts/contract/choice'
import { MultiValueHistoryChart } from 'web/components/charts/generic-charts'
import {
  TooltipProps,
  formatPct,
  getEndDate,
  getRightmostVisibleDate,
} from 'web/components/charts/helpers'
import { Row } from 'web/components/layout/row'

export const ChoiceMiniGraph = (props: {
  contract: CPMMMultiContract | CPMMNumericContract
  multiPoints: MultiPoints
  width: number
  height: number
  selectedAnswerIds?: string[]
  startTime?: number
  showMinimumYScale?: boolean
}) => {
  const {
    contract,
    multiPoints = {},
    width,
    height,
    selectedAnswerIds,
    startTime,
    showMinimumYScale,
  } = props

  const start = startTime ?? contract.createdTime

  const end = getEndDate(contract)
  const answers = useChartAnswers(contract)

  const now = useMemo(() => Date.now(), [multiPoints])

  const data = useMemo(() => {
    const ret = {} as Record<
      string,
      { points: HistoryPoint<never>[]; color: string }
    >

    answers.forEach((a) => {
      const points = cloneDeep(multiPoints[a.id] ?? [])

      if (a.resolution && a.resolutionTime) {
        points.push({
          x: a.resolutionTime,
          y: getAnswerProbability(contract, a.id),
        })
      } else {
        points.push({
          x: end ?? now,
          y: getAnswerProbability(contract, a.id),
        })
      }
      const color = getAnswerColor(a)
      ret[a.id] = { points, color }
    })

    return ret
  }, [answers.length, multiPoints, start, end, now])

  const rightestPointX = Math.max(
    ...Object.values(multiPoints).map((p) => last(p)?.x ?? 0)
  )
  const rightmostDate = getRightmostVisibleDate(end, rightestPointX, now)
  const xScale = scaleTime([start, rightmostDate], [0, width])

  const flattenedYValues = (selectedAnswerIds ?? []).flatMap((key) =>
    data[key] ? data[key].points.map((point) => point.y) : []
  )

  const globalMaxY = Math.max(...flattenedYValues)
  const globalMinY = Math.min(...flattenedYValues)
  const yScale = showMinimumYScale
    ? scaleLinear([globalMinY, globalMaxY], [height, 0])
    : scaleLinear([0, 1], [height, 0])

  return (
    <MultiValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      contractId={contract.id}
      data={data}
      Tooltip={(props) => <ChoiceTooltip answers={answers} ttProps={props} />}
    />
  )
}

const ChoiceTooltip = (props: {
  ttProps: TooltipProps<HistoryPoint> & { ans: string }
  answers: Answer[]
}) => {
  const { ttProps, answers } = props
  const { prev, ans } = ttProps

  if (!prev) return null

  const answer = answers.find((a) => a.id === ans)?.text ?? 'Other'
  const value = formatPct(prev.y)

  return (
    <>
      <div className="flex max-w-xs flex-row justify-between gap-4">
        <Row className="items-center gap-2 overflow-hidden">
          <span className="overflow-hidden text-ellipsis">{answer}</span>
        </Row>
        <span className="text-ink-600">{value}</span>
      </div>
    </>
  )
}
