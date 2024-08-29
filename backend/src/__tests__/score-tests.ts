import { test } from 'bun:test'

export function projectTest(
  testName: string,
  fn: (functions: {
    expectTrue: (description: string, condition: boolean) => void
    incrementScore: (amount: number, max: number, description: string) => void
  }) => Promise<void>
) {
  let score = 0
  let maxScore = 0
  const expectTrue = (description: string, condition: boolean) => {
    maxScore++
    if (condition) {
      score++
      console.log(`${description} - passed`)
    } else {
      console.log(`${description} - failed`)
    }
  }

  const incrementScore = (amount: number, max: number, description: string) => {
    score += amount
    maxScore += max
    console.log(`${description} - score: ${score}/${maxScore}`)
  }

  test(
    testName,
    async () => {
      await fn({ expectTrue, incrementScore })
      console.log(`${testName} - score: ${score}/${maxScore}`)
    },
    { timeout: 200_000 }
  )
}
