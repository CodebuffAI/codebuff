import { useMemo } from 'react'
import { first, groupBy, last, mapValues, sortBy, uniq } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { Bet } from 'common/bet'
import { Answer } from 'common/answer'
import {
  CPMMMultiContract,
  CPMMNumericContract,
  MultiContract,
} from 'common/contract'
import { getAnswerProbability, getContractBetMetrics } from 'common/calculate'
import {
  TooltipProps,
  ZoomParams,
  formatDateInRange,
  formatPct,
  getEndDate,
  getRightmostVisibleDate,
  PointerMode,
} from '../helpers'
import { MultiValueHistoryChart } from '../generic-charts'
import { HistoryPoint, MultiPoints } from 'common/chart'
import { Row } from 'web/components/layout/row'
import { pick } from 'lodash'
import { buildArray } from 'common/util/array'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { formatMoney, maybePluralize } from 'common/util/format'
import { floatingEqual } from 'common/util/math'
import { ChartPosition } from 'common/chart-position'

const CHOICE_ANSWER_COLORS = [
  '#99DDFF', // sky
  '#FFDD99', // sand
  '#FFAABB', // pink
  '#77F299', // light green
  '#CD46EA', // 🍆
  '#F23542', // blood red
  '#FF8C00', // orange
  '#44BB99', // forest
  '#FFD700', // gold
  '#77AADD', // navy
  '#F76B40', // orange-red
  '#C195F0', // Grimace shake purple
  '#0C7AE1', // octarine??
  '#E3E369', // yellow
  '#3F9FFF',
  '#2ECC71',
  '#F1C40F', // dehydrated yellow
  '#E04AC0',
  '#CCB374', // drab tan
  '#96E047',
  '#FFA500',
  '#F0C0DE',
  '#FF69B4',
  '#F9C74F',
  '#F93028',
  '#F49F1C',
  '#DEADFE',
  '#EFD1CC',
  '#5EE7B7',
  '#F96969',
  '#A3DE83',
  '#FFD166',
  '#BAEBE4',
  '#FF85A1',
  '#45EDEA',
  '#FFBF69',
  '#AED0D6',
  '#FFA69E',
  '#DBD56E',
]

export const CHOICE_OTHER_COLOR = '#C2C3DB'

export const nthColor = (index: number) =>
  CHOICE_ANSWER_COLORS[index % CHOICE_ANSWER_COLORS.length]

export function getAnswerColor(answer: Answer) {
  const index = answer.index

  if (answer.text === 'Democratic Party') return '#adc4e3'
  if (answer.text === 'Republican Party') return '#ecbab5'

  return answer.isOther ? CHOICE_OTHER_COLOR : answer.color ?? nthColor(index)
}

const getAnswers = (contract: MultiContract) => {
  const { answers, outcomeType } = contract
  const validAnswers = (answers ?? []).filter(
    (answer) => answer.id !== '0' || outcomeType === 'MULTIPLE_CHOICE'
  )
  return sortBy(validAnswers, (answer) => answer.index)
}

export const getMultiBetPoints = (bets: Bet[]) => {
  return mapValues(groupBy(bets, 'answerId'), (bets) =>
    bets.map((bet) => ({ x: bet.createdTime, y: bet.probAfter }))
  )
}

export function useChartAnswers(contract: MultiContract) {
  return useMemo(() => getAnswers(contract), [contract])
}

export const ChoiceContractChart = (props: {
  contract: CPMMMultiContract | CPMMNumericContract
  multiPoints: MultiPoints
  width: number
  height: number
  chartAnnotations?: ChartAnnotation[]
  zoomParams?: ZoomParams
  showZoomer?: boolean
  highlightAnswerId?: string
  selectedAnswerIds?: string[]
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
  chartPositions?: ChartPosition[]
  hoveredChartPosition?: ChartPosition | null
  setHoveredChartPosition?: (position: ChartPosition | null) => void
}) => {
  const {
    contract,
    multiPoints = {},
    width,
    height,
    zoomParams,
    showZoomer,
    highlightAnswerId,
    selectedAnswerIds,
    pointerMode,
    setHoveredAnnotation,
    hoveredAnnotation,
    chartAnnotations,
    chartPositions,
    hoveredChartPosition,
    setHoveredChartPosition,
  } = props

  const start = contract.createdTime
  const end = getEndDate(contract)
  const answers = useChartAnswers(contract)

  const now = useMemo(() => Date.now(), [multiPoints])

  const data = useMemo(() => {
    const ret = {} as Record<
      string,
      { points: HistoryPoint<never>[]; color: string }
    >

    answers.forEach(
      (a) => {
        const startingPoints = multiPoints[a.id] ?? []
        const additionalPoints = []

        if (a.resolution) {
          if (a.resolutionTime) {
            additionalPoints.push({
              x: a.resolutionTime,
              y: getAnswerProbability(contract, a.id),
            })
          }
        } else {
          additionalPoints.push({
            x: end ?? now,
            y: getAnswerProbability(contract, a.id),
          })
        }

        const color = getAnswerColor(a)
        ret[a.id] = { points: [...startingPoints, ...additionalPoints], color }
      },
      [multiPoints]
    )

    return ret
  }, [answers.length, multiPoints, start, end, now])

  const rightestPointX = Math.max(
    ...Object.values(multiPoints).map((p) => last(p)?.x ?? 0)
  )
  const rightmostDate = getRightmostVisibleDate(end, rightestPointX, now)
  const xScale = scaleTime([start, rightmostDate], [0, width])
  const yScale = scaleLinear([0, 1], [height, 0])
  const chosenAnswerIds = buildArray(selectedAnswerIds, highlightAnswerId)

  return (
    <MultiValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      data={pick(data, chosenAnswerIds)}
      hoveringId={highlightAnswerId}
      Tooltip={
        !zoomParams
          ? undefined
          : (props) => (
              <ChoiceTooltip
                answers={answers}
                xScale={zoomParams.viewXScale}
                ttProps={props}
              />
            )
      }
      contractId={contract.id}
      hoveredAnnotation={hoveredAnnotation}
      setHoveredAnnotation={setHoveredAnnotation}
      pointerMode={pointerMode}
      chartAnnotations={chartAnnotations}
      chartPositions={chartPositions}
      hoveredChartPosition={hoveredChartPosition}
      setHoveredChartPosition={setHoveredChartPosition}
    />
  )
}

export const ChoiceTooltip = (props: {
  ttProps: TooltipProps<HistoryPoint> & { ans: string }
  xScale: any
  answers: Answer[]
}) => {
  const { ttProps, xScale, answers } = props
  const { prev, next, x, ans } = ttProps

  if (!prev) return null

  const [start, end] = xScale.domain()

  const d = xScale.invert(x)

  const answer = answers.find((a) => a.id === ans)?.text ?? 'Other'
  const value = formatPct(prev.y)

  const dateLabel = !next ? 'Now' : formatDateInRange(d, start, end)

  return (
    <>
      <span className="font-semibold">{dateLabel}</span>
      <div className="flex max-w-xs flex-row justify-between gap-4">
        <Row className="items-center gap-2 overflow-hidden">
          <span className="overflow-hidden text-ellipsis">{answer}</span>
        </Row>
        <span className="text-ink-600">{value}</span>
      </div>
    </>
  )
}

export const PositionsTooltip = (props: {
  chartPositions: ChartPosition[]
  hoveredPosition: ChartPosition | null | undefined
}) => {
  const { chartPositions, hoveredPosition } = props
  const firstPosition = first(chartPositions)
  if (!firstPosition) return null
  const { contract, answerId } = firstPosition
  const bets = chartPositions.flatMap((p) => p.bets)
  const contractMetric = getContractBetMetrics(contract, bets, answerId)
  const answerIds = uniq(bets.map((b) => b.answerId))
  const { profit } = contractMetric

  return (
    <Row className="text-ink-600 border-ink-200 dark:border-ink-300 bg-canvas-0/70 absolute -top-3 left-0 z-10 max-w-xs justify-between gap-1 rounded border px-3 py-1.5 text-sm ">
      {hoveredPosition ? (
        <>
          <span className="">
            {hoveredPosition.amount > 0 ? 'Bought' : 'Sold'}:
          </span>
          <span>{formatMoney(hoveredPosition.amount).replace('-', '')}</span>
          <span
            className={
              hoveredPosition.outcome === 'YES'
                ? 'text-green-500'
                : 'text-red-500'
            }
          >
            {hoveredPosition.outcome === 'YES' ? 'Yes' : 'No'}
          </span>
        </>
      ) : (
        <>
          <span className="">
            {floatingEqual(profit, 0) ? 'Profit' : profit > 0 ? 'Made' : 'Lost'}
            :
          </span>
          <span
            className={
              profit > 0 ? 'text-green-500' : profit < 0 ? 'text-red-500' : ''
            }
          >
            {formatMoney(profit).replace('-', '')}
          </span>
          <span>
            {answerIds.length === 1 && contractMetric.maxSharesOutcome
              ? ` on ${contractMetric.maxSharesOutcome}`
              : ` on ${answerIds.length} ${maybePluralize(
                  'answer',
                  answerIds.length
                )}`}
          </span>
        </>
      )}
    </Row>
  )
}
