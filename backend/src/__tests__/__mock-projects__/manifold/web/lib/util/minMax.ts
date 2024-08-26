export type MinMax = {
  min: number
  max: number
}

export function findMinMax(array: number[]): MinMax {
  if (array.length === 0) {
    return { min: 0, max: 0 }
  }
  return array.reduce(
    (result: MinMax, value: number) => {
      return {
        min: Math.min(result.min, value),
        max: Math.max(result.max, value),
      }
    },
    { min: Infinity, max: -Infinity }
  )
}
