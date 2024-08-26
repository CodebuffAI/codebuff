import { interpolateColor } from 'common/util/color'
import {
  DEM_DARK_HEX,
  DEM_LIGHT_HEX,
  REP_LIGHT_HEX,
  REP_DARK_HEX,
} from 'web/components/usa-map/state-election-map'

const RADIUS = 200
const NEEDLE_COLOR_DEFAULT = '#6366f1'
const NEEDLE_COLOR_LIGHT = '#a5b4fc'

const NEEDLE_RADIUS = 5

const SVG_WIDTH = RADIUS * 2
const SVG_HEIGHT = RADIUS + 2 * NEEDLE_RADIUS + 5

const STRONG_X = 10
const STRONG_Y = SVG_HEIGHT - 20

const LIKELY_X = 20
const LIKELY_Y = SVG_HEIGHT - 55

const LEANING_X = 50
const LEANING_Y = SVG_HEIGHT - 105

export function ProbabilityNeedle(props: {
  percentage: number
  width: number
  height: number
}) {
  const { percentage, width, height } = props

  const segments = [
    { percent: 0.05, color: DEM_DARK_HEX },
    {
      percent: 0.1,
      color: interpolateColor(DEM_LIGHT_HEX, DEM_DARK_HEX, 0.5),
    },
    { percent: 0.2, color: DEM_LIGHT_HEX },
    {
      percent: 0.3,
      color: interpolateColor(DEM_LIGHT_HEX, REP_LIGHT_HEX, 0.4),
    },
    { percent: 0.2, color: REP_LIGHT_HEX },
    {
      percent: 0.1,
      color: interpolateColor(REP_DARK_HEX, REP_LIGHT_HEX, 0.5),
    },
    { percent: 0.05, color: REP_DARK_HEX },
  ]

  const innerRadius = RADIUS * 0.2 // Adjust this value to control the inner circle size

  const createPath = (startAngle: number, endAngle: number, color: string) => {
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1

    const startOuterX = RADIUS + RADIUS * Math.cos((Math.PI * startAngle) / 180)
    const startOuterY = RADIUS - RADIUS * Math.sin((Math.PI * startAngle) / 180)
    const endOuterX = RADIUS + RADIUS * Math.cos((Math.PI * endAngle) / 180)
    const endOuterY = RADIUS - RADIUS * Math.sin((Math.PI * endAngle) / 180)

    const startInnerX =
      RADIUS + innerRadius * Math.cos((Math.PI * startAngle) / 180)
    const startInnerY =
      RADIUS - innerRadius * Math.sin((Math.PI * startAngle) / 180)
    const endInnerX =
      RADIUS + innerRadius * Math.cos((Math.PI * endAngle) / 180)
    const endInnerY =
      RADIUS - innerRadius * Math.sin((Math.PI * endAngle) / 180)

    return (
      <path
        key={startAngle}
        d={`
          M ${startOuterX} ${startOuterY}
          A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 0 ${endOuterX} ${endOuterY}
          L ${endInnerX} ${endInnerY}
          A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${startInnerX} ${startInnerY}
          Z
        `}
        fill={color}
      />
    )
  }
  const startingAngle = 180
  let cumulativePercent = startingAngle
  const paths = segments.map(({ percent, color }) => {
    const segmentAngle = percent * 180 // Adjust for semicircle
    const path = createPath(
      startingAngle + cumulativePercent,
      startingAngle + cumulativePercent + segmentAngle,
      color
    )
    cumulativePercent += segmentAngle
    return path
  })

  const needleAngle = 180 - percentage * 180
  const needleLength = RADIUS * 0.55
  const needleX =
    RADIUS + needleLength * Math.cos((Math.PI * needleAngle) / 180)
  const needleY =
    RADIUS - needleLength * Math.sin((Math.PI * needleAngle) / 180)
  const needleColor =
    percentage >= 0.95 || percentage <= 0.05
      ? NEEDLE_COLOR_LIGHT
      : NEEDLE_COLOR_DEFAULT

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
    >
      {paths}

      <text
        x={STRONG_X}
        y={STRONG_Y}
        fontSize="12"
        fontWeight={'thin'}
        fill={'white'}
        opacity={0.8}
      >
        SAFE R
      </text>
      <text
        x={LIKELY_X}
        y={LIKELY_Y}
        fontSize="12"
        fontWeight={'thin'}
        fill={'white'}
        opacity={0.8}
      >
        LIKELY R
      </text>
      <text
        x={LEANING_X}
        y={LEANING_Y}
        fontSize="12"
        fontWeight={'thin'}
        opacity={0.4}
      >
        LEAN R
      </text>
      <text
        x={SVG_WIDTH / 2 - 23.5}
        y={LEANING_Y - 40}
        fontSize="12"
        fontWeight={'thin'}
        opacity={0.4}
      >
        TOSSUP
      </text>
      <text
        x={SVG_WIDTH - LEANING_X - 45}
        y={LEANING_Y}
        fontSize="12"
        fontWeight={'thin'}
        opacity={0.4}
      >
        LEAN D
      </text>
      <text
        x={SVG_WIDTH - LIKELY_X - 50}
        y={LIKELY_Y}
        fontSize="12"
        fontWeight={'thin'}
        fill={'white'}
        opacity={0.8}
      >
        LIKELY D
      </text>
      <text
        x={SVG_WIDTH - STRONG_X - 45}
        y={STRONG_Y}
        fontSize="12"
        fontWeight={'thin'}
        fill={'white'}
        opacity={0.8}
      >
        SAFE D
      </text>

      <line
        x1={RADIUS}
        y1={RADIUS}
        x2={needleX}
        y2={needleY}
        stroke={needleColor}
        strokeWidth="2"
      />
      <circle cx={RADIUS} cy={RADIUS} r={NEEDLE_RADIUS} fill={needleColor} />
      <text
        x={0}
        y={SVG_HEIGHT}
        fontSize="12"
        fill="currentColor"
        opacity={0.3}
        fontWeight={'semibold'}
      >
        Source: manifold.markets
      </text>
    </svg>
  )
}
