import { useMemo } from 'react'
import { scaleTime, scaleLinear } from 'd3-scale'
import { max } from 'lodash'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { formatPercent } from 'common/util/format'
import { Row } from '../layout/row'
import { SingleValueHistoryChart } from './generic-charts'
import { TooltipProps, useZoom } from './helpers'
import { SizedContainer } from 'web/components/sized-container'
import { HistoryPoint } from 'common/chart'
import { curveLinear } from 'd3-shape'

dayjs.extend(utc)
dayjs.extend(timezone)

type Point = {
  x: string // YYYY-MM-DD
  y: number
}

const DailyCountTooltip = (props: TooltipProps<HistoryPoint>) => {
  const { nearest } = props
  return (
    <Row className="items-center gap-2">
      <span className="font-semibold">{dayjs(nearest.x).format('MMM DD')}</span>
      <span className="text-ink-600">{nearest.y}</span>
    </Row>
  )
}

const DailyPercentTooltip = (props: TooltipProps<HistoryPoint>) => {
  const { nearest } = props
  return (
    <Row className="items-center gap-2">
      <span className="font-semibold">{dayjs(nearest.x).format('MMM DD')}</span>
      <span className="text-ink-600">{formatPercent(nearest.y)}</span>
    </Row>
  )
}

export function DailyChart(props: { values: Point[]; pct?: boolean }) {
  const { values, pct } = props

  const data = useMemo(() => {
    return values.map((v) => ({
      x: dayjs(v.x).tz('America/Los_Angeles').startOf('day').valueOf(),
      y: v.y,
    }))
  }, [values])

  const zoomParams = useZoom()
  const [xMin, xMax] = zoomParams.viewXScale.domain()

  const first = data[0].x
  const last = data[data.length - 1].x

  const maxValue = max(
    data
      .filter((d) => d.x >= xMin.valueOf() && d.x <= xMax.valueOf())
      .map((d) => d.y)
  )!

  return (
    <SizedContainer className="mb-10 h-[150px] pr-16 sm:h-[250px] sm:pr-0">
      {(width, height) => (
        <SingleValueHistoryChart
          w={width}
          h={height}
          xScale={scaleTime([first, last], [0, width])}
          yScale={scaleLinear([0, maxValue], [height, 0])}
          yKind={pct ? 'percent' : 'amount'}
          data={data}
          Tooltip={pct ? DailyPercentTooltip : DailyCountTooltip}
          color="#11b981"
          curve={curveLinear}
          zoomParams={zoomParams}
          showZoomer
        />
      )}
    </SizedContainer>
  )
}
