import { test } from 'bun:test'

export function projectTest(
  testName: string,
  fn: (getContext: (subTestName: string) => ScoreTestContext) => Promise<void>
) {
  let score = 0
  let maxScore = 0
  const subScores: { [key: string]: { score: number; max: number } } = {}

  const expectTrue = (
    subTestName: string,
    description: string,
    condition: boolean
  ) => {
    maxScore++
    if (condition) {
      score++
      console.log(`${description} - passed`)
    } else {
      console.log(`${description} - failed`)
    }

    if (!subScores[subTestName]) {
      subScores[subTestName] = { score: 0, max: 0 }
    }
    subScores[subTestName].score += condition ? 1 : 0
    subScores[subTestName].max++
  }

  const incrementScore = (
    subTestName: string,
    amount: number,
    max: number,
    description: string
  ) => {
    console.log(`${description} - ${amount}/${max}`)
    score += amount
    maxScore += max

    if (!subScores[subTestName]) {
      subScores[subTestName] = { score: 0, max: 0 }
    }
    subScores[subTestName].score += amount
    subScores[subTestName].max += max
  }

  const getContext = (subTestName: string) => ({
    expectTrue: expectTrue.bind(null, subTestName),
    incrementScore: incrementScore.bind(null, subTestName),
  })

  test(
    testName,
    async () => {
      await fn(getContext)
      console.log(`${testName} - score: ${score}/${maxScore}`)
      for (const subTestName in subScores) {
        console.log(
          `${subTestName} - score: ${subScores[subTestName].score}/${subScores[subTestName].max}`
        )
      }
    },
    { timeout: 200_000 }
  )
}

export type ScoreTestContext = {
  expectTrue: (description: string, condition: boolean) => void
  incrementScore: (amount: number, max: number, description: string) => void
}
