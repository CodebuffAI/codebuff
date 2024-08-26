import clsx from 'clsx'
import { ValueKind } from 'common/chart'
import { Contract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { buildArray } from 'common/util/array'
import { Axis } from 'd3-axis'
import { ScaleTime, scaleTime } from 'd3-scale'
import { pointer, select } from 'd3-selection'
import { CurveFactory, area, line } from 'd3-shape'
import { ZoomBehavior, zoom, zoomIdentity } from 'd3-zoom'
import dayjs from 'dayjs'
import { clamp, sortBy } from 'lodash'
import React, {
  ReactNode,
  SVGProps,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useEvent } from 'web/hooks/use-event'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { ManaSvg, SpiceSvg, SweepiesSvg } from './mana-spice-chart'
import { PositionsTooltip } from 'web/components/charts/contract/choice'
import { ChartPosition } from 'common/chart-position'

// min number of pixels to mouse drag over to trigger zoom
export const ZOOM_DRAG_THRESHOLD = 16

export const Y_AXIS_MARGIN = 44

export const XAxis = <X,>(props: { w: number; h: number; axis: Axis<X> }) => {
  const { h, axis } = props
  const axisRef = useRef<SVGGElement>(null)
  useEffect(() => {
    if (axisRef.current != null) {
      select(axisRef.current)
        .call(axis)
        .select('.domain')
        .attr('stroke-width', 0)
    }
  }, [h, axis])
  return <g ref={axisRef} transform={`translate(0, ${h})`} />
}

export const YAxis = <Y,>(props: {
  w: number
  axis: Axis<Y>
  noGridlines?: boolean
  iconSVG?: string
}) => {
  const { w, axis, noGridlines, iconSVG } = props
  const axisRef = useRef<SVGGElement>(null)

  useEffect(() => {
    if (axisRef.current != null) {
      const brush = select(axisRef.current).call(axis)

      if (!noGridlines) {
        brush.call((g) =>
          g.selectAll('.tick').each(function () {
            const tick = select(this)

            tick
              .select('line')
              .attr('x2', w)
              .attr('stroke-opacity', 0.1)
              .attr('transform', `translate(-${w}, 0)`)
          })
        )
      }

      // Append SVG icons next to each tick label
      if (iconSVG) {
        brush.selectAll('.tick').each(function () {
          const tick = select(this)
          tick
            .append('svg')
            .attr('width', '1em') // Specify the width and height of the SVG
            .attr('height', '1em')
            .attr('x', '0.5em') // Horizontal offset from the text
            .attr('y', '-0.5em') // Vertical offset to align with text
            .html(iconSVG) // Insert the SVG path using .html() or a similar method
        })
      }

      brush.select('.domain').attr('stroke-width', 0)
      if (iconSVG) {
        brush.selectAll('.tick text').attr('x', '1.7em') // Horizontal offset from the text
      }
    }
  }, [w, axis])

  return <g ref={axisRef} transform={`translate(${w}, 0)`} />
}

export const LinePath = <P,>(
  props: {
    data: P[]
    px: number | ((p: P) => number)
    py: number | ((p: P) => number)
    curve: CurveFactory
  } & SVGProps<SVGPathElement>
) => {
  const { px, py, curve, data: propData, ...rest } = props
  const data = useDeferredValue(propData)
  const d = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    () => line<P>(px, py).curve(curve)(data)!,
    [px, py, curve, data]
  )
  return <path {...rest} fill="none" d={d} />
}

export const AreaPath = <P,>(
  props: {
    data: P[]
    px: number | ((p: P) => number)
    py0: number | ((p: P) => number)
    py1: number | ((p: P) => number)
    curve: CurveFactory
  } & SVGProps<SVGPathElement>
) => {
  const { px, py0, py1, curve, data: propData, ...rest } = props
  const data = useDeferredValue(propData)
  const d = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    () => area<P>(px, py0, py1).curve(curve)(data)!,
    [px, py0, py1, curve, data]
  )
  return <path {...rest} d={d} />
}

export const AreaWithTopStroke = <P,>(props: {
  data: P[]
  color: string
  px: number | ((p: P) => number)
  py0: number | ((p: P) => number)
  py1: number | ((p: P) => number)
  curve: CurveFactory
  className?: string
  onClick?: () => void
}) => {
  const { data, color, px, py0, py1, curve, className, onClick } = props
  const last = data[data.length - 1]
  const lastX = typeof px === 'function' ? px(last) : px
  const lastY = typeof py1 === 'function' ? py1(last) : py1

  return (
    <g>
      <AreaPath
        data={data}
        px={px}
        py0={py0}
        py1={py1}
        curve={curve}
        fill={color}
        className={clsx(' opacity-20', className)}
        onClick={onClick}
      />
      <LinePath data={data} px={px} py={py1} curve={curve} stroke={color} />
      {/* a little extension so that the current value is always visible */}
      <path
        fill="none"
        d={`M${lastX},${lastY} L${lastX + 2},${lastY}`}
        stroke={color}
      />
    </g>
  )
}

export const SliceMarker = (props: {
  color: string
  x: number
  y0: number
  y1: number
}) => {
  const { color, x, y0, y1 } = props
  return (
    <g className="pointer-events-none">
      <line stroke="white" strokeWidth={1} x1={x} x2={x} y1={y0} y2={y1} />
      <circle
        stroke="white"
        strokeWidth={1}
        fill={color}
        cx={x}
        cy={y1}
        r={5}
      />
    </g>
  )
}

export const PositionMarker = (props: {
  x: number
  y0: number
  y1: number
  onHover: (position: ChartPosition) => void
  onLeave: () => void
  isHovered: boolean
  chartPosition: ChartPosition
}) => {
  const { chartPosition, x, y0, y1, onLeave, onHover, isHovered } = props
  const { direction, color } = chartPosition
  const isSale = direction < 0
  const scale = 1
  const pinBottomPointX = x - (isSale ? -12 : 12)
  const pinTopCenterY = y0 - (isSale ? 5 : 17)
  const transform = `translate(${pinBottomPointX}, ${pinTopCenterY}) scale(${scale}) rotate(${
    isSale ? 180 : 0
  })`
  return (
    <g>
      <path
        transform={transform}
        d={
          'm12 6.586-8.707 8.707 1.414 1.414L12 9.414l7.293 7.293 1.414-1.414L12 6.586z'
        }
        style={{
          fill: color,
        }}
        className={clsx(
          isHovered
            ? 'dark:fill-primary-300 fill-primary-500 z-20'
            : !color && 'fill-ink-300 dark:fill-ink-600',
          ' cursor-default'
        )}
        z={isHovered ? 20 : 0}
        strokeWidth={isHovered ? 2 : 1}
      />
      <line
        strokeWidth={isHovered ? 3 : 2}
        strokeDasharray={isHovered ? undefined : '5, 5'}
        style={{
          stroke: color,
        }}
        className={clsx(
          isHovered
            ? 'dark:stroke-primary-300 stroke-primary-500 z-20'
            : !color && 'stroke-ink-300 dark:stroke-ink-600',
          Math.abs(y1 - y0) < 10 && 'hidden'
        )}
        x1={x}
        x2={x}
        y1={pinTopCenterY - (isSale ? 15 : 0)}
        y2={y1}
      />
      <rect
        fill="transparent"
        className={'cursor-default'}
        onMouseEnter={() => onHover(chartPosition)}
        onMouseLeave={onLeave}
        x={x - 10}
        y={pinTopCenterY - (isSale ? 15 : 0)}
        width={20}
        height={20}
      />
    </g>
  )
}

export const AnnotationMarker = (props: {
  x: number
  y0: number
  y1: number
  id: number
  onHover: (id: number) => void
  onLeave: () => void
  isHovered: boolean
}) => {
  const { x, y0, y1, onLeave, onHover, isHovered, id } = props

  const scale = 0.04
  const pinBottomPointX = x - 10
  const pinTopCenterY = y0 - 18
  const pinPath = `M87.084,192c-0.456-5.272-0.688-10.6-0.688-16C86.404,78.8,162.34,0,256.004,0s169.6,78.8,169.6,176
	c0,5.392-0.232,10.728-0.688,16h0.688c0,96.184-169.6,320-169.6,320s-169.6-223.288-169.6-320H87.084z`

  const transform = `translate(${pinBottomPointX}, ${pinTopCenterY}) scale(${scale})` // Adjust these values based on the actual size of your SVG

  return (
    <g onMouseEnter={() => onHover(id)} onMouseLeave={onLeave}>
      <line
        strokeWidth={isHovered ? 3 : 2}
        strokeDasharray={isHovered ? undefined : '5, 5'}
        className={
          isHovered
            ? 'dark:stroke-primary-300 stroke-primary-500 z-20'
            : 'stroke-ink-300 dark:stroke-ink-600'
        }
        x1={x}
        x2={x}
        y1={y0 - 20}
        y2={y1}
      />
      <path
        transform={transform}
        d={pinPath}
        className={clsx(
          isHovered
            ? 'dark:fill-primary-300 fill-primary-500 z-20'
            : 'fill-ink-300 dark:fill-ink-600'
        )}
        z={isHovered ? 20 : 0}
        strokeWidth={isHovered ? 2 : 1}
      />
    </g>
  )
}

export type PointerMode = 'zoom' | 'annotate' | 'examine'

export const SVGChart = <X, TT extends { x: number; y: number }>(props: {
  children: ReactNode
  w: number
  h: number
  xAxis: Axis<X>
  yAxis: Axis<number>
  ttParams?: TT | undefined
  zoomParams?: ZoomParams
  onMouseOver?: (mouseX: number, mouseY: number) => void
  onMouseLeave?: () => void
  Tooltip?: (props: TT) => ReactNode
  noGridlines?: boolean
  className?: string
  // Chart annotation props
  pointerMode?: PointerMode
  onClick?: (x: number, y: number) => void
  xScale?: ScaleTime<number, number>
  yAtTime?: (time: number, answerId?: string | null) => number
  y0?: number
  onHoverAnnotation?: (id: number | null) => void
  hoveredAnnotation?: number | null
  chartAnnotations?: ChartAnnotation[]
  hoveredChartPosition?: ChartPosition | null
  setHoveredChartPosition?: (position: ChartPosition | null) => void
  chartPositions?: ChartPosition[]
  hideXAxis?: boolean
  yKind?: ValueKind
  noWatermark?: boolean
}) => {
  const {
    children,
    w,
    h,
    xAxis,
    yAxis,
    ttParams,
    zoomParams,
    onMouseOver,
    onMouseLeave,
    Tooltip,
    noGridlines,
    className,
    pointerMode = 'zoom',
    onClick,
    xScale,
    yAtTime,
    chartAnnotations,
    y0,
    onHoverAnnotation,
    hoveredAnnotation,
    hideXAxis,
    yKind,
    chartPositions,
    hoveredChartPosition,
    setHoveredChartPosition,
    noWatermark,
  } = props

  const showAnnotations = xScale && yAtTime && y0 !== undefined
  const onPointerMove = (ev: React.PointerEvent) => {
    if (ev.pointerType === 'mouse' || ev.pointerType === 'pen') {
      const [x, y] = pointer(ev)
      onMouseOver?.(x, y)
    }
  }

  const { onPointerUp, selectStart, selectEnd } = useInitZoomBehavior({
    zoomParams,
    w,
    h,
    pointerMode,
    onClick,
  })

  useEffect(() => {
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerUp])

  const onPointerLeave = () => {
    onMouseLeave?.()
    onHoverAnnotation?.(null)
  }

  const id = useId()

  if (w <= 0 || h <= 0) {
    // i.e. chart is smaller than margin
    return null
  }

  return (
    <div
      className={clsx(
        className,
        'relative select-none',
        pointerMode === 'zoom'
          ? 'cursor-crosshair'
          : pointerMode === 'examine'
          ? 'cursor-pointer'
          : 'cursor-copy'
      )}
      onPointerEnter={onPointerMove}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {chartPositions && (
        <PositionsTooltip
          chartPositions={chartPositions}
          hoveredPosition={hoveredChartPosition}
        />
      )}
      {ttParams && Tooltip && (
        <TooltipContainer
          calculatePos={(ttw, tth) =>
            getTooltipPosition(ttParams.x, ttParams.y, w, h, ttw, tth)
          }
        >
          {Tooltip(ttParams)}
        </TooltipContainer>
      )}
      {selectStart != undefined && selectEnd != undefined && (
        // swipeover
        <div
          className={clsx(
            selectEnd - selectStart > ZOOM_DRAG_THRESHOLD
              ? 'bg-primary-400/40'
              : 'bg-canvas-100/40',
            'absolute -z-10 transition-colors'
          )}
          style={{
            left: selectStart,
            right: w - selectEnd,
            top: 0,
            bottom: 0,
          }}
        />
      )}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        overflow="visible"
        ref={zoomParams?.svgRef}
      >
        <defs>
          <filter id={`${id}-blur`}>
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <mask id={`${id}-mask`}>
            <rect
              x={-8}
              y={-8}
              width={w + 16}
              height={h + 16}
              fill="white"
              filter={`url(#${id}-blur)`}
            />
          </mask>
          <clipPath id={`${id}-clip`}>
            <rect x={-32} y={-32} width={w + 64} height={h + 64} />
          </clipPath>
        </defs>

        <g>
          {!hideXAxis && <XAxis axis={xAxis} w={w} h={h} />}

          <YAxis
            axis={yAxis}
            w={w}
            noGridlines={noGridlines}
            iconSVG={
              yKind === ENV_CONFIG.moneyMoniker
                ? ManaSvg
                : yKind === 'spice'
                ? SpiceSvg
                : yKind === 'sweepies'
                ? SweepiesSvg
                : undefined
            }
          />

          {/* clip to stop pointer events outside of graph, and mask for the blur to indicate zoom */}
          <g clipPath={`url(#${id}-clip)`} mask={`url(#${id}-mask)`}>
            {children}
            {/* We can't just change z-index, we have to change rendering order*/}
            {showAnnotations &&
              chartAnnotations
                ?.filter((a) => a.id !== hoveredAnnotation)
                .map((a) => (
                  <AnnotationMarker
                    key={a.id}
                    x={xScale(a.event_time)}
                    y0={y0}
                    y1={yAtTime(a.event_time, a.answer_id)}
                    id={a.id}
                    onHover={(id) => onHoverAnnotation?.(id)}
                    onLeave={() => onHoverAnnotation?.(null)}
                    isHovered={hoveredAnnotation === a.id}
                  />
                ))}
            {showAnnotations &&
              chartAnnotations
                ?.filter((a) => a.id === hoveredAnnotation)
                .map((a) => (
                  <AnnotationMarker
                    key={a.id}
                    x={xScale(a.event_time)}
                    y0={y0}
                    y1={yAtTime(a.event_time, a.answer_id)}
                    id={a.id}
                    onHover={(id) => onHoverAnnotation?.(id)}
                    onLeave={() => onHoverAnnotation?.(null)}
                    isHovered={hoveredAnnotation === a.id}
                  />
                ))}
            {showAnnotations &&
              chartPositions &&
              chartPositions
                .filter(
                  (p) =>
                    !hoveredChartPosition || p.id === hoveredChartPosition.id
                )
                .map((p) => (
                  <PositionMarker
                    key={p.id}
                    x={xScale(p.createdTime)}
                    y0={y0}
                    y1={yAtTime(p.createdTime, p.answerId)}
                    onHover={(cp) => setHoveredChartPosition?.(cp)}
                    onLeave={() => setHoveredChartPosition?.(null)}
                    isHovered={false}
                    chartPosition={p}
                  />
                ))}
          </g>
        </g>
        {!noWatermark && (
          <>
            <rect
              x={4}
              y={h - 23}
              width={150}
              height={18}
              className="fill-canvas-0"
              rx={4}
              ry={4}
              opacity={0.85}
            />
            <text
              x={10}
              y={h - 10}
              fontSize="12"
              fill="currentColor"
              opacity={0.5}
              fontWeight={'semibold'}
            >
              Source: manifold.markets
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

export type TooltipPosition = { left: number; bottom: number }

export const getTooltipPosition = (
  mouseX: number,
  mouseY: number,
  containerWidth: number,
  containerHeight: number,
  tooltipWidth: number,
  tooltipHeight: number
) => {
  let left = mouseX + 6
  let bottom = containerHeight - mouseY + 6

  left = clamp(left, 0, containerWidth - tooltipWidth)
  bottom = clamp(bottom, 0, containerHeight - tooltipHeight)

  return { left, bottom }
}

export type TooltipProps<T> = {
  x: number
  y: number
  prev: T | undefined
  next: T | undefined
  // prev or next, whichever is closer
  nearest: T
}

export const TooltipContainer = (props: {
  calculatePos: (width: number, height: number) => TooltipPosition
  className?: string
  children: React.ReactNode
}) => {
  const { calculatePos, className, children } = props

  const { elemRef, width, height } = useMeasureSize()
  const pos = calculatePos(width ?? 0, height ?? 0)

  return (
    <div
      ref={elemRef}
      className={clsx(
        className,
        'border-ink-200 dark:border-ink-300 bg-canvas-0/70 pointer-events-none absolute z-10 whitespace-pre rounded border px-4 py-2 text-sm'
      )}
      style={{ ...pos }}
    >
      {children}
    </div>
  )
}

export const getEndDate = (contract: Contract) => {
  const { closeTime, resolutionTime } = contract
  const isClosed = !!closeTime && Date.now() > closeTime
  const endDate = resolutionTime ?? (isClosed ? closeTime : null)
  return endDate ?? null
}

export const getRightmostVisibleDate = (
  contractEnd: number | null | undefined,
  lastActivity: number | null | undefined,
  now: number
) => {
  if (contractEnd != null) {
    return contractEnd
  } else if (lastActivity != null) {
    // client-DB clock divergence may cause last activity to be later than now
    return Math.max(lastActivity, now)
  } else {
    return now
  }
}

export const formatPct = (n: number) => {
  return `${(n * 100).toFixed(0)}%`
}

export const formatDateInRange = (
  date: Date | number,
  start: Date | number,
  end: Date | number
) => {
  const includeYear = !dayjs(start).isSame(end, 'year')
  const includeDay = !dayjs(start).isSame(end, 'day')
  const includeHour = dayjs(end).diff(start, 'day') <= 7
  const includeMinute = dayjs(end).diff(start, 'day') <= 1

  const d = dayjs(date)
  const now = Date.now()
  if (
    d.add(1, 'minute').isAfter(now) &&
    d.subtract(1, 'minute').isBefore(now)
  ) {
    return 'Now'
  } else {
    const day = !includeDay
      ? null
      : d.isSame(now, 'day')
      ? '[Today]'
      : d.add(1, 'day').isSame(now, 'day')
      ? '[Yesterday]'
      : d.subtract(1, 'day').isSame(now, 'day')
      ? '[Tomorrow]'
      : 'MMM D'

    const time = includeMinute ? 'h:mma' : includeHour ? 'ha' : null
    const year = includeYear ? 'YYYY' : null

    const format = buildArray(day, time, year).join(', ')
    return format && d.format(format)
  }
}

// ZOOM!

export type ZoomParams = {
  svgRef: React.MutableRefObject<SVGSVGElement | null>
  rescale: (
    scale: ScaleTime<number, number> | null,
    syncZoomer?: boolean
  ) => void
  rescaleBetween: (start: number | Date, end: number | Date) => void
  // full region
  xScale: ScaleTime<number, number>
  // visible region
  viewXScale: ScaleTime<number, number>
  // initializers
  setXScale: (xScale: ScaleTime<number, number>) => void
  setZoomer: (zoomer: ZoomBehavior<SVGSVGElement, unknown>) => void
}

export const useZoom = (
  onRescale?: (xScale: ScaleTime<number, number> | null) => void
): ZoomParams => {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>()
  const xScaleRef = useRef<ScaleTime<number, number>>(scaleTime())

  const [viewXScale, setViewXScale] = useState<ScaleTime<number, number>>(
    scaleTime()
  )

  const rescale = useEvent(
    (scale: ScaleTime<number, number> | null, syncZoomer = true) => {
      onRescale?.(scale)
      const xScale = xScaleRef.current
      const newXScale = scale ?? xScale
      setViewXScale(() => newXScale)

      // keep zoomer in sync
      if (!xScale || !newXScale || !svgRef.current || !syncZoomer) return

      const [min, max] = xScale.domain()
      const [low, high] = newXScale.domain()

      const scaleFactor =
        (max.valueOf() - min.valueOf()) / (high.valueOf() - low.valueOf())

      const translation = newXScale(min) - newXScale(low)

      select(svgRef.current).call(
        zoomRef.current?.transform as any,
        zoomIdentity.translate(translation, 0).scale(scaleFactor)
      )
    }
  )

  const rescaleBetween = useEvent(
    (start: number | Date, end: number | Date) => {
      const xScale = xScaleRef.current
      if (xScale) rescale(xScale.copy().domain([start, end]))
    }
  )

  const xScale = xScaleRef.current

  return {
    svgRef,
    rescale,
    rescaleBetween,
    setZoomer: (z) => {
      zoomRef.current = z
    },
    setXScale: (scale) => {
      xScaleRef.current = scale
      setViewXScale(() => scale)
    },
    xScale: xScale ?? scaleTime(),
    viewXScale: viewXScale ?? xScale ?? scaleTime(),
  }
}

export function useInitZoomBehavior(props: {
  zoomParams?: ZoomParams
  w: number
  h: number
  pointerMode: PointerMode
  onClick?: (x: number, y: number) => void
}) {
  const { zoomParams, onClick, w, h, pointerMode } = props

  const [mouseDownX, setMouseDownX] = useState<number>()
  const [mouseCurrentX, setMouseCurrentX] = useState<number>()
  const [selectStart, selectEnd] = sortBy([mouseDownX, mouseCurrentX])

  useEffect(() => {
    if (!zoomParams) return
    const { setZoomer, rescale, xScale, svgRef } = zoomParams
    if (!svgRef.current) return

    const zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, Infinity])
      .extent([
        [0, 0],
        [w, h],
      ])
      .translateExtent([
        [0, 0],
        [w, h],
      ])
      .on('zoom', (ev) => {
        if (ev.sourceEvent && pointerMode === 'zoom') {
          rescale(ev.transform.rescaleX(xScale), false)
        }
      })
      .filter((ev) => {
        if (pointerMode !== 'zoom') return false
        if (ev instanceof WheelEvent) {
          return ev.ctrlKey || ev.metaKey || ev.altKey
        } else if (ev instanceof TouchEvent) {
          return ev.touches.length === 2
        }
        return !ev.button
      })

    setZoomer(zoomer)
    const svgSelection = select(svgRef.current)

    if (pointerMode === 'zoom') {
      svgSelection
        .on('dblclick.zoom', () => rescale(null))
        .on('mousedown.zoom', (ev) => {
          if (ev.button === 0 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            const [x] = pointer(ev)
            setMouseDownX(x)
          }
        })
        .on('mousemove.zoom', (ev) => {
          const [x] = pointer(ev)
          setMouseCurrentX(x)
        })
    } else {
      svgSelection
        .on('mousedown.zoom', (ev) => {
          const [x, y] = pointer(ev)
          onClick?.(x, y)
        })
        .on('mousemove.zoom', null)
    }
  }, [w, h, zoomParams?.svgRef.current, pointerMode])

  const onPointerUp = useEvent(() => {
    if (pointerMode !== 'zoom') return
    if (
      zoomParams &&
      selectStart != null &&
      selectEnd != null &&
      selectEnd - selectStart > ZOOM_DRAG_THRESHOLD
    ) {
      const xScale = zoomParams.viewXScale

      const start = xScale.invert(selectStart)
      const end = xScale.invert(selectEnd)

      if (start && end) {
        zoomParams?.rescaleBetween(start, end)
      }
    }
    setMouseDownX(undefined)
  })

  return { onPointerUp, selectStart, selectEnd }
}
