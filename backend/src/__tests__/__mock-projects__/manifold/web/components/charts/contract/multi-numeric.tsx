import { useMemo } from 'react'
import { keyBy, last, sum } from 'lodash'
import { scaleLinear, scaleTime } from 'd3-scale'
import { CPMMNumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { getEndDate, getRightmostVisibleDate, ZoomParams } from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { SingleContractChartTooltip } from './single-value'
import { map, zip } from 'd3-array'
import {
  formatExpectedValue,
  getExpectedValue,
  answerTextToMidpoint,
} from 'common/multi-numeric'
import { MultiPoints } from 'common/chart'
import { getFilledInMultiNumericBetPoints } from 'common/contract-params'
import { Row } from 'web/components/layout/row'

const getBetPoints = (contract: CPMMNumericContract, bets: MultiPoints) => {
  const filledInBetPoints = getFilledInMultiNumericBetPoints(bets, contract)
  const answerTexts = keyBy(contract.answers, 'id')
  // multiply the prob value by the value of the bucket
  const expectedValues = Object.entries(filledInBetPoints).map(
    ([answerId, pts]) =>
      pts.map((pt) => ({
        x: pt[0],
        y: pt[1] * answerTextToMidpoint(answerTexts[answerId].text),
      }))
  )
  return map(zip(...expectedValues), (group) => ({
    y: sum(group.map((pt) => pt.y)) ?? 0,
    x: group[0].x,
  }))
}
export const DistributionChartTooltip = (props: {
  ttProps: { x: number; y: number }
  getX: (x: number) => string
  formatY: (y: number) => string
}) => {
  const { ttProps, formatY } = props
  const { y } = ttProps
  const x = props.getX(ttProps.x)

  return (
    <Row className="items-center gap-2">
      <span className="font-semibold">{x}</span>
      <span className="text-ink-600">{formatY(y)}</span>
    </Row>
  )
}

export const MultiNumericContractChart = (props: {
  contract: CPMMNumericContract
  multiPoints: MultiPoints
  width: number
  height: number
  zoomParams?: ZoomParams
  showZoomer?: boolean
}) => {
  const { contract, width, multiPoints, height, zoomParams, showZoomer } = props
  const { min, max } = contract
  const start = contract.createdTime
  const end = getEndDate(contract)
  const startP = getExpectedValue(contract, true)
  const endP = getExpectedValue(contract)
  const stringifiedMultiPoints = JSON.stringify(multiPoints)
  const betPoints = useMemo(
    () => getBetPoints(contract, multiPoints),
    [stringifiedMultiPoints]
  )
  const now = useMemo(() => Date.now(), [stringifiedMultiPoints])

  const singlePointData = useMemo(
    () => [{ x: start, y: startP }, ...betPoints, { x: end ?? now, y: endP }],
    [JSON.stringify(betPoints), start, startP, end, endP]
  )
  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)
  const xScale = scaleTime([start, rightmostDate], [0, width])

  // clamp log scale to make sure zeroes go to the bottom
  const yScale = scaleLinear([min, max], [height, 0])
  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      negativeThreshold={min}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      data={singlePointData}
      Tooltip={(props) => (
        <SingleContractChartTooltip
          ttProps={props}
          xScale={zoomParams?.viewXScale ?? xScale}
          formatY={(y) => formatExpectedValue(y, contract)}
        />
      )}
      color={NUMERIC_GRAPH_COLOR}
    />
  )
}
