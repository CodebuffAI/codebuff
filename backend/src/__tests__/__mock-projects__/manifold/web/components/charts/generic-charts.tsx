import { bisector } from 'd3-array'
import { axisBottom, axisRight } from 'd3-axis'
import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import {
  CurveFactory,
  curveLinear,
  curveStepAfter,
  curveStepBefore,
  line,
} from 'd3-shape'
import { last, mapValues, range } from 'lodash'
import {
  ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import { DistributionPoint, HistoryPoint, Point, ValueKind } from 'common/chart'
import { formatMoneyNumber, formatPercent } from 'common/util/format'
import { useEvent } from 'web/hooks/use-event'
import {
  AreaPath,
  AreaWithTopStroke,
  formatPct,
  LinePath,
  PointerMode,
  SliceMarker,
  SVGChart,
  TooltipProps,
  ZoomParams,
} from './helpers'
import { roundToNearestFive } from 'web/lib/util/roundToNearestFive'
import { ZoomSlider } from './zoom-slider'
import clsx from 'clsx'
import {
  AnnotateChartModal,
  ReadChartAnnotationModal,
} from 'web/components/annotate-chart'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { DistributionChartTooltip } from 'web/components/charts/contract/multi-numeric'
import { getAnswerContainingValue, getPrecision } from 'common/multi-numeric'
import { CPMMNumericContract } from 'common/contract'
import { ChartPosition } from 'common/chart-position'

const interpolateY = (
  curve: CurveFactory,
  x: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number
) => {
  if (curve === curveLinear) {
    if (x1 == x0) {
      return y0
    } else {
      const p = (x - x0) / (x1 - x0)
      return y0 * (1 - p) + y1 * p
    }
  } else if (curve === curveStepAfter) {
    return y0
  } else if (curve === curveStepBefore) {
    return y1
  } else {
    return 0
  }
}

export const getTickValues = (min: number, max: number, n: number) => {
  let step = (max - min) / (n - 1)
  let theMin = min
  let theMax = max
  if (step > 10) {
    theMin = roundToNearestFive(min)
    theMax = roundToNearestFive(max)
    step = (theMax - theMin) / (n - 1)
  }
  return [theMin, ...range(1, n - 1).map((i) => theMin + step * i), theMax]
}

export const dataAtXSelector = <Y, P extends Point<number, Y>>(
  data: P[],
  xScale?: ScaleTime<number, number>
) => {
  const bisect = bisector((p: P) => p.x)
  return (posX: number) => {
    const x = xScale ? xScale.invert(posX) : posX
    const i = bisect.left(data, x)
    const prev = data[i - 1] as P | undefined
    const next = data[i] as P | undefined
    const nearest = data[bisect.center(data, x)]
    return { prev, next, nearest, x: posX }
  }
}
export const dataAtTimeSelector = <Y, P extends Point<number, Y>>(
  data: P[]
) => {
  return dataAtXSelector(data)
}

export const DistributionChart = <P extends DistributionPoint>(props: {
  data: P[]
  w: number
  h: number
  color: string
  xScale: ScaleContinuousNumeric<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  curve?: CurveFactory
}) => {
  const { data, w, h, color, xScale, yScale, curve } = props

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py0 = yScale(yScale.domain()[0])
  const py1 = useCallback((p: P) => yScale(p.y), [yScale])

  const { xAxis, yAxis } = useMemo(() => {
    const xAxis = axisBottom<number>(xScale).ticks(w / 100)
    const yAxis = axisRight<number>(yScale).tickFormat((n) => formatPct(n))
    return { xAxis, yAxis }
  }, [w, xScale, yScale])

  return (
    <SVGChart w={w} h={h} xAxis={xAxis} yAxis={yAxis}>
      <AreaWithTopStroke
        color={color}
        data={data}
        px={px}
        py0={py0}
        py1={py1}
        curve={curve ?? curveLinear}
      />
    </SVGChart>
  )
}
export const DoubleDistributionChart = <P extends DistributionPoint>(props: {
  data: P[]
  otherData: P[]
  w: number
  h: number
  color: string
  newColor: string
  xScale: ScaleContinuousNumeric<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  contract: CPMMNumericContract
  curve?: CurveFactory
  verticalLines?: [number, number]
  shadedRanges?: [number, number][]
}) => {
  const {
    data,
    otherData,
    shadedRanges,
    w,
    h,
    newColor,
    color,
    xScale,
    yScale,
    curve,
    verticalLines,
    contract,
  } = props

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py0 = yScale(yScale.domain()[0])
  const py1 = useCallback((p: P) => yScale(p.y), [yScale])

  const { xAxis, yAxis } = useMemo(() => {
    const xTicks = xScale.ticks(w / 100)
    const xAxis = axisBottom<number>(xScale).tickValues(
      verticalLines ? [...xTicks, ...verticalLines] : xTicks
    )

    const yAxis = axisRight<number>(yScale).tickFormat((n) => formatPct(n))
    return { xAxis, yAxis }
  }, [w, xScale, yScale, verticalLines])

  const aline = line<[number, number]>()
    .x((d) => xScale(d[0]))
    .y((d) => yScale(d[1]))

  const [mouse, setMouse] = useState<{
    x: number
    y: number
  }>()
  const onMouseOver = useEvent((p: { x: number; y: number } | undefined) => {
    const mouseX = p?.x
    if (!mouseX) {
      setMouse(undefined)
      return
    }
    const scaledX = xScale.invert(mouseX)
    const y = getAnswerContainingValue(scaledX, contract)?.prob ?? 0
    setMouse({
      x: scaledX,
      y,
    })
  })

  function getDecimalPlaces(precision: number): number {
    if (Number.isInteger(precision)) {
      return 0
    } else {
      return Math.floor(Math.abs(Math.log10(precision)))
    }
  }

  function formatNumber(num: number, precision: number): string {
    const decimalPlaces = getDecimalPlaces(precision)
    const factor = Math.pow(10, decimalPlaces)
    const roundedNum = Math.floor(num * factor) / factor
    return roundedNum.toFixed(decimalPlaces)
  }

  return (
    <SVGChart
      w={w}
      h={h}
      xAxis={xAxis}
      yAxis={yAxis}
      ttParams={mouse}
      onMouseOver={(x, y) => onMouseOver({ x, y } as P)}
      Tooltip={(props) =>
        props && (
          <DistributionChartTooltip
            getX={(x) => {
              const precision = getPrecision(
                contract.min,
                contract.max,
                contract.answers.length
              )
              return formatNumber(x, precision)
            }}
            formatY={(y) => formatPercent(y)}
            ttProps={props}
          />
        )
      }
      onMouseLeave={() => onMouseOver(undefined)}
    >
      <AreaWithTopStrokeAndRange
        color={color}
        data={data}
        px={px}
        py0={py0}
        py1={py1}
        curve={curve ?? curveLinear}
        shadedRanges={shadedRanges}
      />
      {otherData.length > 0 && (
        <AreaWithTopStroke
          color={newColor}
          data={otherData}
          px={px}
          py0={py0}
          py1={py1}
          curve={curve ?? curveLinear}
        />
      )}
      {verticalLines && (
        <>
          <path
            d={
              aline([
                [verticalLines[0], yScale.domain()[0]],
                [verticalLines[0], yScale.domain()[1]],
              ]) ?? undefined
            }
            stroke="gray"
            strokeWidth={1}
            strokeDasharray={4}
          />
          <path
            d={
              aline([
                [verticalLines[1], yScale.domain()[0]],
                [verticalLines[1], yScale.domain()[1]],
              ]) ?? undefined
            }
            stroke="gray"
            strokeWidth={1}
            strokeDasharray={4}
          />
        </>
      )}
      {mouse && (
        <SliceMarker
          color="#5BCEFF"
          x={xScale(mouse.x)}
          y0={py0}
          y1={yScale(mouse.y)}
        />
      )}
    </SVGChart>
  )
}

export const DiagonalPattern = (props: {
  id: string
  color: string
  strokeWidth?: number
  size?: number
}) => {
  const { id, color, strokeWidth = 3, size = 15 } = props
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={size}
      height={size}
      patternTransform="rotate(-45)"
    >
      <rect width={strokeWidth} height={size} fill={color}></rect>
    </pattern>
  )
}

const AreaWithTopStrokeAndRange = <P extends DistributionPoint>(props: {
  color: string
  data: P[]
  px: (p: P) => number
  py0: number
  py1: (p: P) => number
  curve: CurveFactory
  rangeColor?: string
  shadedRanges?: [number, number][]
}) => {
  const { color, data, px, py0, py1, curve, shadedRanges, rangeColor } = props

  if (!shadedRanges) {
    return (
      <AreaWithTopStroke
        color={color}
        data={data}
        px={px}
        py0={py0}
        py1={py1}
        curve={curve}
      />
    )
  }

  const patternId = `pattern-${Math.random().toString(36).slice(2, 9)}`
  const rangeAreas = shadedRanges.map(([rangeStart, rangeEnd], index) => {
    const rangeData = data.filter((p) => p.x >= rangeStart && p.x <= rangeEnd)
    return (
      <AreaWithTopStroke
        key={index}
        color={`url(#${patternId})`}
        data={rangeData}
        px={px}
        py0={py0}
        py1={py1}
        curve={curve}
      />
    )
  })
  return (
    <>
      <AreaWithTopStroke
        color={color}
        data={data}
        px={px}
        py0={py0}
        py1={py1}
        curve={curve}
      />
      <DiagonalPattern id={patternId} color={rangeColor ?? '#007bcb'} />
      {rangeAreas}
    </>
  )
}

// multi line chart
export const MultiValueHistoryChart = <P extends HistoryPoint>(props: {
  data: { [id: string]: { points: P[]; color: string } }
  w: number
  h: number
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  zoomParams?: ZoomParams
  chartAnnotations?: ChartAnnotation[]
  showZoomer?: boolean
  yKind?: ValueKind
  curve?: CurveFactory
  hoveringId?: string
  Tooltip?: (props: TooltipProps<P> & { ans: string }) => ReactNode
  contractId?: string
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
  chartPositions?: ChartPosition[]
  hoveredChartPosition?: ChartPosition | null
  setHoveredChartPosition?: (position: ChartPosition | null) => void
}) => {
  const {
    data,
    w,
    h,
    yScale,
    zoomParams,
    showZoomer,
    Tooltip,
    pointerMode = 'zoom',
    hoveredAnnotation,
    setHoveredAnnotation,
    contractId,
    chartAnnotations = [],
    chartPositions = [],
    setHoveredChartPosition,
    hoveredChartPosition,
  } = props

  useLayoutEffect(() => {
    if (props.xScale) {
      zoomParams?.setXScale(props.xScale)
    }
  }, [w])

  const xScale = zoomParams?.viewXScale ?? props.xScale

  const {
    chartAnnotationTime,
    setChartAnnotationTime,
    onClick,
    setShowChartAnnotationModal,
    showChartAnnotationModal,
  } = useAnnotateOnClick(
    xScale,
    contractId,
    pointerMode,
    hoveredAnnotation,
    chartAnnotations,
    (x, y) => getMarkerPosition(x, y)?.ans
  )

  const [ttParams, setTTParams] = useState<TooltipProps<P> & { ans: string }>()
  const curve = props.curve ?? curveStepAfter

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py = useCallback((p: P) => yScale(p.y), [yScale])

  const { xAxis, yAxis } = useMemo(() => {
    const [min, max] = yScale.domain()
    const nTicks = h < 200 ? 3 : 5
    const pctTickValues = getTickValues(min, max, nTicks)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
    const yAxis = axisRight<number>(yScale)
      .tickValues(pctTickValues)
      .tickFormat((n) => formatPct(n))

    return { xAxis, yAxis }
  }, [w, h, xScale, yScale])

  const sortedLines = useMemo(
    () =>
      Object.entries(data)
        .map(([id, { points, color }]) => ({
          points,
          color,
          id,
        }))
        .sort((a, b) => {
          const endA = last(a.points)
          const endB = last(b.points)
          if (!endA) return -1
          if (!endB) return 1
          return endA.y - endB.y
        }),
    [data]
  )

  const selectors = mapValues(data, (data) =>
    dataAtXSelector(data.points, xScale)
  )
  const timeSelectors = mapValues(data, (data) =>
    dataAtTimeSelector(data.points)
  )
  const getMarkerPosition = useEvent((mouseX: number, mouseY: number) => {
    const valueY = yScale.invert(mouseY)
    const ps = sortedLines.map((data) => selectors[data.id](mouseX))
    let closestIdx = 0
    ps.forEach((p, i) => {
      const closePrev = ps[closestIdx].prev
      const closestDist = closePrev ? Math.abs(closePrev.y - valueY) : 1
      if (p.prev && p.next && Math.abs(p.prev.y - valueY) < closestDist) {
        closestIdx = i
      }
    })
    const p = ps[closestIdx]
    if (p?.prev) {
      return {
        ...p,
        ans: sortedLines[closestIdx].id,
        x: mouseX,
        y: yScale(p.prev.y),
      }
    } else {
      return undefined
    }
  })

  const onMouseOver = useEvent((mouseX: number, mouseY: number) => {
    if (hoveredChartPosition?.answerId) {
      const params = getMarkerPosition(
        xScale(hoveredChartPosition.createdTime),
        getYValueByAnswerIdAndTime(
          hoveredChartPosition.createdTime,
          hoveredChartPosition.answerId
        ) ?? 1
      )

      setTTParams(
        params
          ? {
              ...params,
              ans: hoveredChartPosition.answerId,
            }
          : undefined
      )
    } else setTTParams(getMarkerPosition(mouseX, mouseY))
  })

  const onMouseLeave = useEvent(() => {
    setTTParams(undefined)
  })

  const hoveringId = props.hoveringId ?? ttParams?.ans
  const hoveringData = hoveringId ? data[hoveringId] : null

  const getYValueByAnswerIdAndTime = (time: number, answerId: string) => {
    const selector = timeSelectors[answerId]
    if (!selector) return null
    const point = selector(time)
    return point ? yScale(point.nearest.y) : null
  }

  return (
    <>
      <SVGChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
        ttParams={ttParams}
        zoomParams={zoomParams}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
        Tooltip={Tooltip}
        noGridlines
        className="group"
        pointerMode={pointerMode}
        onClick={onClick}
        chartAnnotations={chartAnnotations}
        hoveredAnnotation={hoveredAnnotation}
        onHoverAnnotation={setHoveredAnnotation}
        chartPositions={chartPositions?.filter(
          (cp) => xScale(cp.createdTime) < w && xScale(cp.createdTime) > 0
        )}
        setHoveredChartPosition={setHoveredChartPosition}
        hoveredChartPosition={hoveredChartPosition}
        y0={yScale(0)}
        xScale={xScale}
        yAtTime={(time, answerId) =>
          answerId ? getYValueByAnswerIdAndTime(time, answerId) ?? 1 : 1
        }
      >
        {sortedLines.map(
          ({ id, points, color }) =>
            (!hoveringId || hoveringId !== id) && (
              <g key={id}>
                <LinePath
                  data={points}
                  px={px}
                  py={py}
                  curve={curve}
                  className={clsx(
                    'stroke-canvas-0 transition-[stroke-width]',
                    hoveringId && hoveringId !== id
                      ? 'stroke-[0px] opacity-50'
                      : 'stroke-[4px]'
                  )}
                />
                <LinePath
                  data={points}
                  px={px}
                  py={py}
                  curve={curve}
                  className={clsx(
                    ' transition-[stroke-width]',
                    hoveringId && hoveringId !== id
                      ? 'stroke-1 opacity-50'
                      : 'stroke-2'
                  )}
                  stroke={color}
                />
                <line />{' '}
                {/* hack to make line appear if only two data points (no bets). idk why it works*/}
              </g>
            )
        )}
        {/* show hovering line on top */}
        {hoveringData && (
          <>
            <LinePath
              data={hoveringData.points}
              px={px}
              py={py}
              curve={curve}
              className={'stroke-2'}
              stroke={hoveringData.color}
            />
            <AreaPath
              data={hoveringData.points}
              px={px}
              py0={yScale(0)}
              py1={py}
              curve={curve}
              fill={hoveringData.color}
              opacity={0.5}
            />
          </>
        )}
        {ttParams && (
          <SliceMarker
            color="#5BCEFF"
            x={ttParams.x}
            y0={yScale(0)}
            y1={ttParams.y}
          />
        )}
      </SVGChart>
      {showZoomer && zoomParams && (
        <ZoomSlider zoomParams={zoomParams} className="relative top-4" />
      )}
      {chartAnnotationTime !== undefined &&
        contractId &&
        pointerMode === 'annotate' && (
          <AnnotateChartModal
            open={true}
            setOpen={(open) => {
              if (!open) setChartAnnotationTime(undefined)
            }}
            contractId={contractId}
            atTime={chartAnnotationTime.t}
            answerId={chartAnnotationTime.answerId}
          />
        )}
      {showChartAnnotationModal && (
        <ReadChartAnnotationModal
          open={true}
          setOpen={() => setShowChartAnnotationModal(undefined)}
          chartAnnotation={showChartAnnotationModal}
        />
      )}
    </>
  )
}

const useAnnotateOnClick = (
  xScale: ScaleTime<number, number> | undefined,
  contractId: string | undefined,
  pointerMode: PointerMode,
  hoveredAnnotation: number | null | undefined,
  chartAnnotations: ChartAnnotation[],
  getAnswerId?: (x: number, y: number) => string | undefined
) => {
  const [showChartAnnotationModal, setShowChartAnnotationModal] =
    useState<ChartAnnotation>()
  const [chartAnnotationTime, setChartAnnotationTime] = useState<
    { t: number; answerId?: string } | undefined
  >()

  const onClick = useEvent((x: number, y: number) => {
    if (!xScale || !contractId) {
      console.error('no xScale and/or contractId')
      return
    }
    if (pointerMode === 'annotate')
      setChartAnnotationTime({
        t: xScale.invert(x).valueOf(),
        answerId: getAnswerId?.(x, y),
      })
    else if (pointerMode === 'examine') {
      const chartAnnotation = chartAnnotations?.find(
        (a) => a.id === hoveredAnnotation
      )
      setShowChartAnnotationModal(chartAnnotation)
    }
  })
  return {
    chartAnnotationTime,
    setChartAnnotationTime,
    onClick,
    setShowChartAnnotationModal,
    showChartAnnotationModal,
  }
}

export const SingleValueHistoryChart = <P extends HistoryPoint>(props: {
  data: P[]
  w: number
  h: number
  color: string | [top: string, bottom: string]
  /** y value above which is top color, below which is bottom color */
  negativeThreshold?: number
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  zoomParams?: ZoomParams
  showZoomer?: boolean
  yKind?: ValueKind
  curve?: CurveFactory
  onMouseOver?: (p: P | undefined) => void
  onMouseLeave?: () => void
  Tooltip?: (props: TooltipProps<P>) => ReactNode
  pct?: boolean
  contractId?: string
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
  chartAnnotations?: ChartAnnotation[]
  hideXAxis?: boolean
  onGraphClick?: () => void
  areaClassName?: string
  className?: string
}) => {
  const {
    contractId,
    data,
    w,
    h,
    color,
    Tooltip,
    negativeThreshold = 0,
    showZoomer,
    curve = curveStepAfter,
    yScale,
    zoomParams,
    hoveredAnnotation,
    setHoveredAnnotation,
    pointerMode = 'zoom',
    chartAnnotations = [],
    hideXAxis,
    onGraphClick,
    areaClassName,
  } = props

  useLayoutEffect(() => {
    if (props.xScale) {
      zoomParams?.setXScale(props.xScale)
    }
  }, [w])

  const xScale = zoomParams?.viewXScale ?? props.xScale

  const yKind = props.yKind ?? 'amount'

  const [mouse, setMouse] = useState<TooltipProps<P>>()

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py0 = yScale(negativeThreshold)
  const py1 = useCallback((p: P) => yScale(p.y), [yScale])
  const { xAxis, yAxis } = useMemo(() => {
    const [min, max] = yScale.domain()
    const nTicks = h < 200 ? 3 : 5
    const customTickValues = getTickValues(min, max, nTicks)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 120)
    const yAxis =
      yKind === 'percent'
        ? axisRight<number>(yScale)
            .tickValues(customTickValues)
            .tickFormat((n) => formatPct(n))
        : yKind === 'Ṁ' || yKind === 'spice' || yKind === 'sweepies'
        ? negativeThreshold
          ? axisRight<number>(yScale)
              .tickValues(customTickValues)
              .tickFormat((n) => formatMoneyNumber(n))
          : axisRight<number>(yScale)
              .ticks(nTicks)
              .tickFormat((n) => formatMoneyNumber(n))
        : axisRight<number>(yScale).ticks(nTicks)
    return { xAxis, yAxis }
  }, [w, h, yKind, xScale, yScale])

  const xRangeSelector = dataAtXSelector(data, xScale)
  const allTimeSelector = dataAtTimeSelector(data)

  const onMouseOver = useEvent((mouseX: number) => {
    setMouse(getMarkerPosition(mouseX, props.onMouseOver))
  })
  const getMarkerPosition = useCallback(
    (
      mouseX: number,
      onMouseOver?: (p: P | undefined) => void,
      useTimeSelector?: boolean
    ) => {
      const p = useTimeSelector
        ? allTimeSelector(mouseX)
        : xRangeSelector(mouseX)
      onMouseOver?.(p.prev)
      if (p.prev) {
        const x0 = xScale(p.prev.x)
        const x1 = p.next ? xScale(p.next.x) : x0
        const y0 = yScale(p.prev.y)
        const y1 = p.next ? yScale(p.next.y) : y0
        const markerY = interpolateY(curve, mouseX, x0, x1, y0, y1)

        return { ...p, y: markerY }
      } else {
        return undefined
      }
    },
    [xScale, yScale, curve, allTimeSelector, xRangeSelector]
  )

  const onMouseLeave = useEvent(() => {
    props.onMouseOver?.(undefined)
    setMouse(undefined)
    if (!!props.onMouseLeave) {
      props.onMouseLeave()
    }
  })

  const {
    chartAnnotationTime,
    setChartAnnotationTime,
    onClick,
    setShowChartAnnotationModal,
    showChartAnnotationModal,
  } = useAnnotateOnClick(
    xScale,
    contractId,
    pointerMode,
    hoveredAnnotation,
    chartAnnotations
  )
  const gradientId = useId()
  const chartTheshold = yScale(negativeThreshold)

  return (
    <>
      <SVGChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
        ttParams={mouse}
        zoomParams={zoomParams}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
        Tooltip={Tooltip}
        onClick={onClick}
        xScale={xScale}
        y0={py0}
        yAtTime={(x: number) => getMarkerPosition(x, undefined, true)?.y ?? 0}
        chartAnnotations={chartAnnotations}
        hoveredAnnotation={hoveredAnnotation}
        onHoverAnnotation={setHoveredAnnotation}
        pointerMode={pointerMode}
        hideXAxis={hideXAxis}
        yKind={yKind}
      >
        {typeof color !== 'string' && (
          <defs>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id={gradientId}
              gradientTransform="rotate(90)"
            >
              <stop offset={0} stopColor={color[0]} />
              <stop offset={chartTheshold / w} stopColor={color[0]} />
              <stop offset={chartTheshold / w} stopColor={color[1]} />
              <stop offset={1} stopColor={color[1]} />
            </linearGradient>
          </defs>
        )}
        {data.length > 0 && (
          <AreaWithTopStroke
            color={typeof color === 'string' ? color : `url(#${gradientId})`}
            data={data}
            px={px}
            py0={py0}
            py1={py1}
            curve={curve}
            className={areaClassName}
            onClick={onGraphClick}
          />
        )}
        {mouse && (
          <SliceMarker color="#5BCEFF" x={mouse.x} y0={py0} y1={mouse.y} />
        )}
      </SVGChart>
      {showZoomer && zoomParams && (
        <ZoomSlider
          zoomParams={zoomParams}
          color="light-green"
          className="relative top-4"
        />
      )}
      {chartAnnotationTime !== undefined &&
        contractId &&
        pointerMode === 'annotate' && (
          <AnnotateChartModal
            open={true}
            setOpen={(open) => {
              if (!open) setChartAnnotationTime(undefined)
            }}
            contractId={contractId}
            atTime={chartAnnotationTime.t}
          />
        )}
      {showChartAnnotationModal && (
        <ReadChartAnnotationModal
          open={true}
          setOpen={() => setShowChartAnnotationModal(undefined)}
          chartAnnotation={showChartAnnotationModal}
        />
      )}
    </>
  )
}

// copied gratuitously from SingleValueHistoryChart
export const SingleValueStackedHistoryChart = <P extends HistoryPoint>(props: {
  data: P[]
  w: number
  h: number
  topColor: string
  bottomColor: string
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  zoomParams?: ZoomParams
  showZoomer?: boolean
  curve?: CurveFactory
  onMouseOver?: (p: P | undefined) => void
  Tooltip?: (props: TooltipProps<P>) => ReactNode
  ttProps?: TooltipProps<P>
}) => {
  const {
    data,
    w,
    h,
    topColor,
    bottomColor,
    Tooltip,
    showZoomer,
    curve = curveStepAfter,
    yScale,
    zoomParams,
  } = props

  useLayoutEffect(() => {
    if (props.xScale) {
      zoomParams?.setXScale(props.xScale)
    }
  }, [w])

  const xScale = zoomParams?.viewXScale ?? props.xScale

  const [mouse, setMouse] = useState<TooltipProps<P>>()

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py0 = yScale(0)
  const pyMid = useCallback((p: P) => yScale(p.y), [yScale])
  const py1 = yScale(1)

  const { xAxis, yAxis } = useMemo(() => {
    const [min, max] = yScale.domain()
    const nTicks = h < 200 ? 3 : 5
    const customTickValues = getTickValues(min, max, nTicks)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 120)
    const yAxis = axisRight<number>(yScale)
      .tickValues(customTickValues)
      .tickFormat((n) => formatPct(n))

    return { xAxis, yAxis }
  }, [w, h, xScale, yScale])

  const xRangeSelector = dataAtXSelector(data, xScale)
  const allTimeSelector = dataAtTimeSelector(data)

  const onMouseOver = useEvent((mouseX: number) => {
    setMouse(getMarkerPosition(mouseX, props.onMouseOver))
  })
  const getMarkerPosition = useCallback(
    (
      mouseX: number,
      onMouseOver?: (p: P | undefined) => void,
      useTimeSelector?: boolean
    ) => {
      const p = useTimeSelector
        ? allTimeSelector(mouseX)
        : xRangeSelector(mouseX)
      onMouseOver?.(p.prev)
      if (p.prev) {
        const x0 = xScale(p.prev.x)
        const x1 = p.next ? xScale(p.next.x) : x0
        const y0 = yScale(p.prev.y)
        const y1 = p.next ? yScale(p.next.y) : y0
        const markerY = interpolateY(curve, mouseX, x0, x1, y0, y1)

        return { ...p, y: markerY }
      } else {
        return undefined
      }
    },
    [xScale, yScale, curve, allTimeSelector, xRangeSelector]
  )

  const onMouseLeave = useEvent(() => {
    props.onMouseOver?.(undefined)
    setMouse(undefined)
  })

  return (
    <>
      <SVGChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
        ttParams={mouse}
        zoomParams={zoomParams}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
        Tooltip={Tooltip}
        xScale={xScale}
        y0={py0}
        yAtTime={(x: number) => getMarkerPosition(x, undefined, true)?.y ?? 0}
      >
        <AreaPath
          fill={topColor}
          data={data}
          px={px}
          py1={py1}
          py0={pyMid}
          curve={curve}
          opacity={0.8}
        />
        <AreaPath
          fill={bottomColor}
          data={data}
          px={px}
          py1={pyMid}
          py0={py0}
          curve={curve}
          opacity={0.8}
        />

        <LinePath
          data={data}
          px={px}
          py={pyMid}
          curve={curve}
          className="stroke-canvas-50"
        />

        {mouse && (
          <g>
            <line
              strokeWidth={1}
              x1={mouse.x}
              x2={mouse.x}
              y1={py1}
              y2={py0}
              className="stroke-ink-800"
              strokeDasharray={4}
            />
            <circle
              cx={mouse.x}
              cy={mouse.y}
              r={4}
              className="fill-ink-200 stroke-ink-800"
            />
          </g>
        )}
      </SVGChart>

      {showZoomer && zoomParams && (
        <ZoomSlider
          zoomParams={zoomParams}
          color="indigo"
          className="relative top-4"
        />
      )}
    </>
  )
}
