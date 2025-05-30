import { describe, expect, it, mock } from 'bun:test'
import { TEST_USER_ID } from 'common/constants'
import { createPatch } from 'diff'
import path from 'path'
import { rewriteWithOpenAI } from '../fast-rewrite'

// Mock database interactions
mock.module('pg-pool', () => ({
  Pool: class {
    connect() {
      return {
        query: () => ({
          rows: [{ id: 'test-user-id' }],
          rowCount: 1,
        }),
        release: () => {},
      }
    }
  },
}))

// Mock message saving
mock.module('backend/llm-apis/message-cost-tracker', () => ({
  saveMessage: () => Promise.resolve(),
}))

describe.skip('rewriteWithOpenAI', () => {
  it('should correctly integrate edit snippet changes while preserving formatting', async () => {
    const testDataDir = path.join(__dirname, 'test-data', 'dex-go')
    const originalContent = await Bun.file(`${testDataDir}/original.go`).text()
    const editSnippet = await Bun.file(`${testDataDir}/edit-snippet.go`).text()
    const expectedResult = await Bun.file(`${testDataDir}/expected.go`).text()

    const result = await rewriteWithOpenAI(
      originalContent,
      editSnippet,
      'taskruntoolcall.go',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      undefined
    )

    const patch = createPatch('test.ts', expectedResult, result)
    const patchLines = patch.split('\n').slice(4)
    const linesChanged = patchLines.filter(
      (line) => line.startsWith('+') || line.startsWith('-')
    ).length
    console.log(patch)
    expect(linesChanged).toBeLessThanOrEqual(14)
  }, 240_000)
})
