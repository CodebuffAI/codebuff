import { CurveFactory } from 'd3-shape'
import { useId, useMemo } from 'react'
import { DiagonalPattern } from '../charts/generic-charts'
import { AreaPath } from '../charts/helpers'
import { PortfolioHoveredGraphType } from './portfolio-value-section'
import { HistoryPoint } from 'common/chart'
import { AreaPointType } from './portfolio-chart'

export function StackedArea<P extends HistoryPoint>(props: {
  id: string
  points: P[]
  color: string
  index: number
  xScale: (x: number) => number
  yScale: (y: number) => number
  stackedData: { points: P[]; color: string; id: string }[]
  curve: CurveFactory
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  portfolioHoveredGraph: PortfolioHoveredGraphType
  w: number
}) {
  const {
    id,
    points,
    color,
    index,
    xScale,
    yScale,
    stackedData,
    curve,
    onClick,
    onMouseEnter,
    onMouseLeave,
    portfolioHoveredGraph,
  } = props

  const negativePatternId = useId()

  const createAreaData = (points: P[], y0Calculator: (idx: number) => number) =>
    points.map((point, idx) => ({
      x: point.x,
      y0: y0Calculator(idx),
      y1: point.y,
    }))

  const { points: previousPoints } =
    index > 0 ? stackedData[index - 1] : { points: undefined }

  const { positiveData, negativeData } = useMemo(() => {
    const positivePoints: P[] = []
    const negativePoints: P[] = []

    points.forEach((point, index) => {
      const baselineY =
        previousPoints && previousPoints[index] ? previousPoints[index].y : 0
      const isNegative = baselineY > point.y

      positivePoints.push({
        ...point,
        y: isNegative ? baselineY : point.y,
      })

      negativePoints.push({
        ...point,
        y: isNegative ? point.y : baselineY,
      })
    })
    // Create separate datasets for positive and negative areas
    return {
      positiveData: createAreaData(positivePoints, (idx) =>
        previousPoints ? previousPoints[idx].y : 0
      ),
      negativeData: createAreaData(negativePoints, (idx) =>
        previousPoints ? previousPoints[idx].y : 0
      ),
    }
  }, [points, previousPoints, id])
  return (
    <>
      <defs>
        <DiagonalPattern
          id={negativePatternId}
          color={color}
          size={5}
          strokeWidth={3}
        />
      </defs>
      <AreaPath<AreaPointType>
        data={positiveData}
        px={(p) => xScale(p.x)}
        py0={(p) => yScale(p.y0)}
        py1={(p) => yScale(p.y1)}
        curve={curve}
        fill={color}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        className="transition-opacity"
        opacity={portfolioHoveredGraph == id ? 1 : 0.85}
      />
      <AreaPath<AreaPointType>
        data={negativeData}
        px={(p) => xScale(p.x)}
        py0={(p) => yScale(p.y0)}
        py1={(p) => yScale(p.y1)}
        curve={curve}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        fill={index == 0 ? color : `url(#${negativePatternId})`}
        className="transition-opacity"
        opacity={portfolioHoveredGraph == id ? 1 : 0.85}
      />
    </>
  )
}
