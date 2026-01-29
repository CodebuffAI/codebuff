import path from 'path'

import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { createTestAgentRuntimeParams } from '@codebuff/common/testing/fixtures/agent-runtime'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { promptSuccess } from '@codebuff/common/util/error'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { createPatch } from 'diff'

import { rewriteWithOpenAI } from '../fast-rewrite'

describe('rewriteWithOpenAI', () => {
  let agentRuntimeImpl: any

  beforeAll(async () => {
    // Mock database interactions
    await mockModule('pg-pool', () => ({
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
  })

  beforeEach(() => {
    agentRuntimeImpl = { ...createTestAgentRuntimeParams() }
  })

  afterAll(() => {
    clearMockedModules()
  })

  it('should correctly integrate edit snippet changes while preserving formatting', async () => {
    const testDataDir = path.join(__dirname, 'test-data', 'dex-go')
    const originalContent = await Bun.file(`${testDataDir}/original.go`).text()
    const editSnippet = await Bun.file(`${testDataDir}/edit-snippet.go`).text()
    const expectedResult = await Bun.file(`${testDataDir}/expected.go`).text()
    let capturedPromptText: string | undefined

    agentRuntimeImpl.promptAiSdk = async (params: any) => {
      capturedPromptText = params?.messages?.[0]?.content?.[0]?.text
      return promptSuccess(expectedResult.replace(/\n$/, ''))
    }

    const result = await rewriteWithOpenAI({
      ...agentRuntimeImpl,
      oldContent: originalContent,
      editSnippet,
      clientSessionId: 'clientSessionId',
      fingerprintId: 'fingerprintId',
      userInputId: 'userInputId',
      userId: TEST_USER_ID,
      runId: 'test-run-id',
    })

    expect(capturedPromptText).toContain(originalContent)
    expect(capturedPromptText).toContain(editSnippet)

    const patch = createPatch('test.ts', expectedResult, result)
    const patchLines = patch.split('\n').slice(4)
    const linesChanged = patchLines.filter(
      (line) => line.startsWith('+') || line.startsWith('-'),
    ).length
    console.log(patch)
    expect(linesChanged).toBeLessThanOrEqual(14)
  }, 240_000)
})
