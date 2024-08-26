import { Dictionary, range } from 'lodash'
import { type SupabaseDirectClient } from 'shared/supabase/init'

export const saveCalibrationData = async (pg: SupabaseDirectClient) => {
  const bets = await pg.many('select * from sample_resolved_bets(15, 0.02)')
  const n = bets?.length ?? 0
  console.log('loaded', n, 'sampled bets')

  const buckets = getCalibrationPoints(bets ?? [])
  const points = !bets ? [] : getXY(buckets)
  const score = !bets ? 0 : brierScore(bets)
  const data = { buckets, points, score, n }

  console.log('calibration calculated, brier score', score)

  const query = {
    text: 'INSERT INTO platform_calibration (data) VALUES ($1)',
    values: [JSON.stringify(data)],
  }

  try {
    await pg.query(query)
    console.log(`Row inserted into platform_calibration`)
  } catch (error) {
    console.error(`Error inserting row into platform_calibration: ${error}`)
  }
}

export const points = [1, 3, 5, ...range(10, 100, 10), 95, 97, 99]

interface BetSample {
  prob: number
  is_yes: boolean
}

const getCalibrationPoints = (data: BetSample[]) => {
  const probBuckets = Object.fromEntries(points.map((p) => [p, 0]))
  const countBuckets = Object.fromEntries(points.map((p) => [p, 0]))

  for (const { prob, is_yes } of data) {
    const rawP = prob * 100

    // get probability bucket that's closest to a prespecified point
    const p = points.reduce((prev, curr) =>
      Math.abs(curr - rawP) < Math.abs(prev - rawP) ? curr : prev
    )

    if (is_yes) probBuckets[p]++
    countBuckets[p]++
  }

  const buckets = Object.fromEntries(
    points.map((p) => [
      p,
      countBuckets[p] ? probBuckets[p] / countBuckets[p] : 0,
    ])
  )

  return buckets
}

const brierScore = (data: BetSample[]) => {
  let total = 0

  for (const { prob, is_yes } of data) {
    const outcome = is_yes ? 1 : 0
    total += (outcome - prob) ** 2
  }
  return !data.length ? 0 : total / data.length
}

const getXY = (probBuckets: Dictionary<number>) => {
  const xy = []

  for (const point of points) {
    if (probBuckets[point] !== undefined) {
      xy.push({ x: point / 100, y: probBuckets[point] })
    }
  }

  return xy
}
