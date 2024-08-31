import { sortBy, sum } from 'lodash'

export const logInterpolation = (min: number, max: number, value: number) => {
  if (value <= min) return 0
  if (value >= max) return 1

  return Math.log(value - min + 1) / Math.log(max - min + 1)
}

export const logit = (x: number) => Math.log(x / (1 - x))

export function median(xs: number[]) {
  if (xs.length === 0) return NaN

  const sorted = sortBy(xs, (x) => x)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

export function average(xs: number[]) {
  return xs.length === 0 ? 0 : sum(xs) / xs.length
}

export function sumOfSquaredError(xs: number[]) {
  const mean = average(xs)
  let total = 0
  for (const x of xs) {
    const error = x - mean
    total += error * error
  }
  return total
}

export const EPSILON = 0.00000001

export function floatingEqual(a: number, b: number, epsilon = EPSILON) {
  return Math.abs(a - b) < epsilon
}
export function floatingGreater(a: number, b: number, epsilon = EPSILON) {
  return a - epsilon > b
}

export function floatingGreaterEqual(a: number, b: number, epsilon = EPSILON) {
  return a + epsilon >= b
}

export function floatingLesserEqual(a: number, b: number, epsilon = EPSILON) {
  return a - epsilon <= b
}
