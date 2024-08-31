import { area, curveStepBefore, curveLinear, line } from 'd3-shape'
import { scaleLinear, scaleTime } from 'd3-scale'
import { Point } from 'common/edge/og'

export function ProfitLossGraph(props: {
  data: Point[]
  height: number
  /** scaled width / height */
  aspectRatio?: number
}) {
  const { data, height, aspectRatio = 1 } = props
  const w = height * aspectRatio
  const h = height
  const visibleRange = [data[0].x, data[data.length - 1].x]
  const minY = Math.min(...data.map((p) => p.y))
  const maxY = Math.max(...data.map((p) => p.y))
  const curve = curveStepBefore

  const xScale = scaleTime(visibleRange, [0, w])
  const yScale = scaleLinear([minY, maxY], [h, 0])
  const px = (p: Point) => xScale(p.x)
  const py0 = yScale(0)
  const py1 = (p: Point) => yScale(p.y)
  // const clipId = ':rnm:'
  const gradientId = ':rnc:'
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const da = area(px, py0, py1).curve(curve)(data)!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const dl = line(px, py1).curve(curve)(data)!
  const color = (p: Point) => (p.y >= 0 ? '#14b8a6' : '#FFA799')
  const stops = computeColorStops(data, color, px)

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id={gradientId}>
          {stops.map((s, i) => (
            <stop key={i} offset={`${s.x / w}`} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>

      <g>
        <path d={da} fill={`url(#${gradientId})`} opacity={0.2} />
        <path
          d={dl}
          stroke={`url(#${gradientId})`}
          strokeWidth={4}
          fill="none"
        />
      </g>
    </svg>
  )
}

const computeColorStops = (
  data: Point[],
  pc: (p: Point) => string,
  px: (p: Point) => number
) => {
  const segments: { x: number; color: string }[] = []
  let currOffset = px(data[0])
  let currColor = pc(data[0])
  for (const p of data) {
    const c = pc(p)
    if (c !== currColor) {
      segments.push({ x: currOffset, color: currColor })
      currOffset = px(p)
      currColor = c
    }
  }
  segments.push({ x: currOffset, color: currColor })

  const stops: { x: number; color: string }[] = []
  stops.push({ x: segments[0].x, color: segments[0].color })
  for (const s of segments.slice(1)) {
    stops.push({ x: s.x, color: stops[stops.length - 1].color })
    stops.push({ x: s.x, color: s.color })
  }
  return stops
}

export function Sparkline(props: {
  data: Point[]
  height: number
  /** width / height */
  aspectRatio?: number
  min: number
  max: number
  color?: string
  className?: string
}) {
  const { data, height: h, aspectRatio = 1, min, max, color, className } = props
  const w = h * aspectRatio
  const visibleRange = [data[0].x, data[data.length - 1].x]
  const curve = data.length > 50 ? curveLinear : curveStepBefore

  const xScale = scaleTime(visibleRange, [0, w - 4])
  const yScale = scaleLinear([min, max], [h, 0])
  const px = (p: Point) => xScale(p.x)
  const py1 = (p: Point) => yScale(p.y)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const dl = line(px, py1).curve(curve)(data)!

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className}>
      <path
        d={dl}
        stroke={color}
        strokeWidth={4}
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ProbGraph(props: {
  data: Point[]
  height: number
  /** scaled width / height */
  aspectRatio?: number
  color?: string
}) {
  const { data, height, color = '#14b866', aspectRatio = 1 } = props
  const w = height * aspectRatio
  const h = height
  const visibleRange = [data[0].x, data[data.length - 1].x]
  const minY = Math.min(...data.map((p) => p.y))
  const maxY = Math.max(...data.map((p) => p.y))
  const curve = curveLinear
  const fillStretchFactor = 5
  const xScale = scaleTime(visibleRange, [0, w])
  const yScale = scaleLinear([minY, maxY + 0.01], [h / 3, 0])
  const px = (p: Point) => xScale(p.x)
  const adjustedPy0 = yScale(minY) * fillStretchFactor
  const py1 = (p: Point) => yScale(p.y)
  // const clipId = ':rnm:'
  const gradientId = ':rnc:'
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const da = area(px, adjustedPy0, py1).curve(curve)(data)!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const dl = line(px, py1).curve(curve)(data)!

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.25" />
        </linearGradient>
      </defs>

      <g>
        <path d={da} fill={`url(#${gradientId})`} opacity={0.1} />
        <path
          d={dl}
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}
