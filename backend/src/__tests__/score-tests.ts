import { test } from 'bun:test'

export function projectTest(
  testName: string,
  fn: (
    expectTrue: (description: string, condition: boolean) => void
  ) => Promise<void>
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

  test(
    testName,
    async () => {
      await fn(expectTrue)
      console.log(`${testName} - score: ${score}/${maxScore}`)
    },
    { timeout: 200_000 }
  )
}
