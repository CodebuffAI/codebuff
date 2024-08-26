import { base64toPoints } from './edge/og'
import { removeUndefinedProps } from './util/object'
import { first, last, mapValues, meanBy } from 'lodash'

export type Point<X, Y, T = unknown> = { x: X; y: Y; obj?: T }
export type HistoryPoint<T = unknown> = Point<number, number, T>
export type DistributionPoint<T = unknown> = Point<number, number, T>
export type ValueKind = 'Ṁ' | 'percent' | 'amount' | 'spice' | 'sweepies'

export type MultiPoints = { [answerId: string]: HistoryPoint<never>[] }

/** answer  -> base 64 encoded */
export type MultiBase64Points = { [answerId: string]: string }

export type MultiSerializedPoints = { [answerId: string]: [number, number][] }
/** [x, y] */
export type SerializedPoint = Readonly<[number, number]>

export const unserializePoints = (points: SerializedPoint[]) => {
  return points.map(([x, y]) => removeUndefinedProps({ x, y }))
}

export const unserializeBase64Multi = (data: MultiBase64Points) => {
  return mapValues(data, (text) => base64toPoints(text))
}

export const serializeMultiPoints = (data: {
  [answerId: string]: HistoryPoint[]
}) => {
  return mapValues(data, (points) =>
    points.map(({ x, y }) => [x, y] as [number, number])
  )
}

export const maxMinBin = <P extends HistoryPoint>(
  points: P[],
  bins: number
) => {
  if (points.length < 2 || bins <= 0) return points

  const min = points[0].x
  const max = points[points.length - 1].x
  const binWidth = Math.ceil((max - min) / bins)

  // for each bin, get the max, min, and median in that bin
  // TODO: time-weighted average instead of median?
  const result = []
  let lastInBin = points[0]
  for (let i = 0; i < bins; i++) {
    const binStart = min + i * binWidth
    const binEnd = binStart + binWidth
    const binPoints = points.filter((p) => p.x >= binStart && p.x < binEnd)
    if (binPoints.length === 0) {
      // insert a synthetic point at the start of the bin to prevent long diagonal lines
      result.push({ ...lastInBin, x: binEnd })
    } else if (binPoints.length <= 3) {
      lastInBin = binPoints[binPoints.length - 1]
      result.push(...binPoints)
    } else {
      lastInBin = binPoints[binPoints.length - 1]
      binPoints.sort((a, b) => a.y - b.y)
      const min = binPoints[0]
      const max = binPoints[binPoints.length - 1]
      const median = binPoints[Math.floor(binPoints.length / 2)]
      result.push(...[min, max, median].sort((a, b) => a.x - b.x))
    }
  }

  return result
}

export function binAvg<P extends HistoryPoint>(sorted: P[], limit = 100) {
  const length = sorted.length
  if (length <= limit) {
    return sorted
  }

  const min = first(sorted)?.x ?? 0
  const max = last(sorted)?.x ?? 0
  const binWidth = Math.ceil((max - min) / limit)

  const newPoints = []
  let lastAvgY = sorted[0].y

  for (let i = 0; i < limit; i++) {
    const binStart = min + i * binWidth
    const binEnd = binStart + binWidth
    const binPoints = sorted.filter((p) => p.x >= binStart && p.x < binEnd)
    if (binPoints.length > 0) {
      lastAvgY = meanBy(binPoints, 'y')
    }
    newPoints.push({ x: binEnd, y: lastAvgY })
  }

  return newPoints
}
