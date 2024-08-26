import { HistoryPoint, ValueKind } from 'common/chart'
import { formatMoneyNumber } from 'common/util/format'
import { axisBottom, axisRight } from 'd3-axis'
import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import { CurveFactory, curveStepAfter } from 'd3-shape'
import { mapValues } from 'lodash'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { useEvent } from 'web/hooks/use-event'
import { dataAtTimeSelector, dataAtXSelector } from '../charts/generic-charts'
import {
  LinePath,
  PointerMode,
  SliceMarker,
  TooltipProps,
  ZoomParams,
} from '../charts/helpers'
import { ZoomSlider } from '../charts/zoom-slider'
import { PortfolioMode, PortfolioTooltip } from './portfolio-value-graph'
import {
  GraphValueType,
  PortfolioHoveredGraphType,
  emptyGraphValues,
} from './portfolio-value-section'
import { StackedArea } from './stacked-data-area'
import { SPICE_TO_MANA_CONVERSION_RATE } from 'common/envs/constants'
import { ManaSpiceChart } from '../charts/mana-spice-chart'

export type AreaPointType = {
  x: number // The x-coordinate
  y0: number // Lower boundary of the area
  y1: number // Upper boundary of the area
}

// hacky solution
const SPICE_IDX = 0
const BALANCE_IDX = 1
const INVESTED_IDX = 2

// multi line chart
export const PortfolioChart = <P extends HistoryPoint>(props: {
  data: Record<string, { points: P[]; color: string }>
  w: number
  h: number
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  zoomParams?: ZoomParams
  showZoomer?: boolean
  yKind?: ValueKind
  curve?: CurveFactory
  hoveringId?: string
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
  updateGraphValues: (newGraphValues: GraphValueType) => void
  setPortfolioFocus: (mode: PortfolioMode) => void
  portfolioHoveredGraph: PortfolioHoveredGraphType
  setPortfolioHoveredGraph: (hovered: PortfolioHoveredGraphType) => void
}) => {
  const {
    data,
    w,
    h,
    yScale,
    zoomParams,
    showZoomer,
    pointerMode = 'zoom',
    hoveredAnnotation,
    setHoveredAnnotation,
    updateGraphValues,
    setPortfolioFocus,
    portfolioHoveredGraph,
    setPortfolioHoveredGraph,
  } = props

  useLayoutEffect(() => {
    if (props.xScale) {
      zoomParams?.setXScale(props.xScale)
    }
  }, [w])

  const xScale = zoomParams?.viewXScale ?? props.xScale
  const [ttParams, setTTParams] = useState<
    TooltipProps<P> & {
      ans: string
    }
  >()
  const curve = props.curve ?? curveStepAfter

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py = useCallback((p: P) => yScale(p.y), [yScale])

  const { xAxis, yAxis } = useMemo(() => {
    const nTicks = h < 200 ? 3 : 5
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
    const yAxis = axisRight<number>(yScale)
      .ticks(nTicks)
      .tickFormat((n) => formatMoneyNumber(n))

    return { xAxis, yAxis }
  }, [w, h, xScale, yScale])

  const timeSelectors = mapValues(data, (data) =>
    dataAtTimeSelector(data.points)
  )
  // Accumulate y-values to stack lines
  const stackedData = useMemo(() => {
    const cumulativeData: Record<number, number> = {}

    // Go through each dataset
    return Object.entries(data).reduce<
      {
        points: P[]
        color: string
        id: string
      }[]
    >((acc, [id, { points, color }]) => {
      const stackedPoints = points.map((point) => {
        const cumulativeY = (cumulativeData[point.x] || 0) + point.y
        cumulativeData[point.x] = cumulativeY // Update cumulative sum for this x-value
        return { ...point, y: cumulativeY } // Return new point with updated y-value
      })

      acc.push({ id, points: stackedPoints, color })
      return acc
    }, [])
  }, [data])

  const topmostIdx = stackedData.length - 1
  const selectors = useMemo(() => {
    return Object.fromEntries(
      stackedData.map(({ id, points }) => [id, dataAtXSelector(points, xScale)])
    )
  }, [stackedData, xScale])

  const unstackedSelectors = useMemo(() => {
    // Create a new object where keys are the IDs of each dataset and values are the selector functions
    return Object.fromEntries(
      Object.entries(data).map(([id, { points }]) => {
        // For each dataset, create a selector function that can find the data point based on the x-value
        return [id, dataAtXSelector(points, xScale)]
      })
    )
  }, [data, xScale])

  const getMarkerPosition = useEvent((mouseX: number) => {
    const ps = stackedData.map((data) => selectors[data.id](mouseX))
    const unstackedPs = Object.entries(data).map(([id]) => {
      return unstackedSelectors[id](mouseX)
    })

    unstackedPs.forEach((p, i) => {
      if (i == SPICE_IDX) {
        updateGraphValues({
          spice: (p.prev?.y ?? 0) / SPICE_TO_MANA_CONVERSION_RATE,
        })
      }
      if (i == BALANCE_IDX) {
        updateGraphValues({ balance: p.prev?.y ?? null })
      }
      if (i == INVESTED_IDX) {
        updateGraphValues({ invested: p.prev?.y ?? null })
      }
    })

    const p = ps[topmostIdx]

    updateGraphValues({ net: p?.prev?.y })

    if (p?.prev) {
      return {
        ...p,
        ans: stackedData[topmostIdx].id,
        x: mouseX,
        y: yScale(p.prev.y),
      }
    } else {
      return undefined
    }
  })

  const onMouseOver = useEvent((mouseX: number, _mouseY: number) => {
    setTTParams(getMarkerPosition(mouseX))
  })

  const onMouseLeave = useEvent(() => {
    setTTParams(undefined)
    updateGraphValues(emptyGraphValues)
  })

  const getYValueByAnswerIdAndTime = (time: number, answerId: string) => {
    const selector = timeSelectors[answerId]
    if (!selector) return null
    const point = selector(time)
    return point ? yScale(point.nearest.y) : null
  }

  return (
    <>
      <ManaSpiceChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
        ttParams={ttParams}
        zoomParams={zoomParams}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
        // eslint-disable-next-line react/prop-types
        Tooltip={(props) => <PortfolioTooltip date={xScale.invert(props.x)} />}
        noGridlines
        className="group"
        pointerMode={pointerMode}
        hoveredAnnotation={hoveredAnnotation}
        onHoverAnnotation={setHoveredAnnotation}
        y0={yScale(0)}
        xScale={xScale}
        yAtTime={(time, answerId) =>
          answerId ? getYValueByAnswerIdAndTime(time, answerId) ?? 1 : 1
        }
      >
        {stackedData.map(({ id, points, color }, i) => {
          return (
            <StackedArea
              key={id}
              id={id}
              points={points}
              stackedData={stackedData}
              color={color}
              index={i}
              xScale={xScale}
              yScale={yScale}
              curve={curve}
              onClick={() => {
                setPortfolioFocus(id as PortfolioMode)
              }}
              onMouseEnter={() => {
                setPortfolioHoveredGraph(id as PortfolioHoveredGraphType)
              }}
              onMouseLeave={() => {
                setPortfolioHoveredGraph(undefined)
              }}
              portfolioHoveredGraph={portfolioHoveredGraph}
              w={w}
            />
          )
        })}
        <LinePath
          data={stackedData[topmostIdx].points}
          px={px}
          py={py}
          curve={curve}
          className="stroke-ink-1000"
        />
        {ttParams && (
          <SliceMarker
            color="#5BCEFF"
            x={ttParams.x}
            y0={yScale(0)}
            y1={ttParams.y}
          />
        )}
      </ManaSpiceChart>
      {showZoomer && zoomParams && (
        <ZoomSlider zoomParams={zoomParams} className="relative top-4" />
      )}
    </>
  )
}
