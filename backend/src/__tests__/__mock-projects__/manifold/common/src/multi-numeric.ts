import { CPMMNumericContract, MULTI_NUMERIC_BUCKETS_MAX } from 'common/contract'
import { filterDefined } from 'common/util/array'
import { find, findLast, mean, sum } from 'lodash'
import {
  getAnswerProbability,
  getInitialAnswerProbability,
} from 'common/calculate'
import { Answer } from 'common/answer'

export const getMultiNumericAnswerMidpoints = (
  contract: CPMMNumericContract
) => {
  return contract.answers.map((a) => mean(answerTextToRange(a.text)))
}

export const getPrecision = (min: number, max: number, buckets: number) =>
  Math.abs(max - min) / buckets

export const getDecimalPlaces = (min: number, max: number, buckets: number) =>
  getPrecision(min, max, buckets) % 1 === 0 ? 0 : 2

export const getMultiNumericAnswerBucketRanges = (
  min: number,
  max: number,
  precision: number
) => {
  const rangeSize = max - min
  if (rangeSize === 0 || isNaN(precision)) {
    return [[min, max]]
  }
  const decimalPlaces = precision % 1 === 0 ? 0 : 2
  const buckets = Math.ceil(rangeSize / precision)

  const ranges: [number, number][] = []
  for (let i = 0; i < buckets; i++) {
    const bucketStart = Number((min + i * precision).toFixed(decimalPlaces))
    const bucketEnd = Number((min + (i + 1) * precision).toFixed(decimalPlaces))
    if (bucketEnd > max) ranges.push([bucketStart, max])
    else ranges.push([bucketStart, bucketEnd])
  }

  return ranges
}

export const getMultiNumericAnswerBucketRangeNames = (
  min: number,
  max: number,
  precision: number
) => {
  const highestPrecision = (max - min) / MULTI_NUMERIC_BUCKETS_MAX
  const lowestPrecision = (max - min) / 2
  const hasPrecisionError =
    !precision || precision < highestPrecision || precision > lowestPrecision
  if (hasPrecisionError) return []
  const ranges = getMultiNumericAnswerBucketRanges(min, max, precision)
  return ranges.map(([min, max]) => `${min}-${max}`)
}
export const answerToRange = (answer: Answer) => answerTextToRange(answer.text)

export const answerTextToRange = (originalAnswerText: string) => {
  const answerText = originalAnswerText.trim()
  const regex = /[-+]?\d+(\.\d+)?/g
  const matches = answerText.match(regex)
  if (!matches || matches.length !== 2) {
    console.error('Invalid numeric answer text', answerText)
    return [0, 0]
  }
  const dashCount = answerText.split('-').length - 1
  const min =
    dashCount === 1 ? Math.abs(parseFloat(matches[0])) : parseFloat(matches[0])
  const max =
    dashCount === 1 ? Math.abs(parseFloat(matches[1])) : parseFloat(matches[1])

  return [min, max]
}

export const answerTextToMidpoint = (answerText: string) => {
  const [min, max] = answerTextToRange(answerText)
  return (max + min) / 2
}
export const answerToMidpoint = (answer: Answer) => {
  return answerTextToMidpoint(answer.text)
}

export function getExpectedValue(
  contract: CPMMNumericContract,
  initialOnly?: boolean
) {
  const { answers } = contract

  const answerProbabilities = filterDefined(
    answers.map((a) =>
      initialOnly
        ? getInitialAnswerProbability(contract, a)
        : getAnswerProbability(contract, a.id)
    )
  )
  const answerValues = answers.map((a) => mean(answerToRange(a)))

  return sum(answerProbabilities.map((p, i) => p * answerValues[i]))
}

export function getFormattedExpectedValue(contract: CPMMNumericContract) {
  return formatExpectedValue(getExpectedValue(contract), contract)
}

export function formatExpectedValue(
  value: number,
  contract: CPMMNumericContract
) {
  const { answers, min, max } = contract
  // There are a few NaN & undefined values on dev
  if (isNaN(value) || min === undefined || max === undefined || max === min)
    return 'N/A'
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: getDecimalPlaces(min, max, answers.length),
  })
  return formatter.format(value).replace('$', '')
}
export const getAnswerContainingValue = (
  value: number,
  contract: CPMMNumericContract
) => {
  const { answers } = contract
  return find(answers, (a) => {
    const [start, end] = answerToRange(a)
    return value >= start && value <= end
  })
}

export const getRangeContainingValue = (
  value: number,
  contract: CPMMNumericContract
) => {
  const { min, max } = contract
  const buckets = contract.answers.map((a) => answerToRange(a))
  const containingBucket = find(buckets, (bucket) => {
    const [start, end] = bucket
    return value >= start && value <= end
  })

  if (containingBucket) return containingBucket as [number, number]

  const bucketBelow = findLast(buckets, (bucket) => {
    const [, end] = bucket
    return value > end
  })
  const bucketAbove = find(buckets, (bucket) => {
    const [start] = bucket
    return value < start
  })

  return [bucketBelow?.[0] ?? min, bucketAbove?.[1] ?? max] as [number, number]
}

export const getRangeContainingValues = (
  values: number[],
  contract: CPMMNumericContract
) => {
  const ranges = values.map((amount) =>
    getRangeContainingValue(amount, contract)
  )
  const overallMin = Math.min(...ranges.map((r) => r[0]))
  const overallMax = Math.max(...ranges.map((r) => r[1]))
  return [overallMin, overallMax] as [number, number]
}

export const getExpectedValuesArray = (contract: CPMMNumericContract) => {
  const { answers } = contract
  return answers.flatMap((answer) =>
    answerToRange(answer).map((v) => ({
      x: v,
      y: getAnswerProbability(contract, answer.id),
    }))
  )
}

export const NEW_GRAPH_COLOR = '#d968ff'
