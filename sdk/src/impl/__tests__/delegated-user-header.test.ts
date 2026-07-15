import { FREEBUFF_ACTING_USER_HEADER } from '@codebuff/common/constants/freebuff-models'
import { afterEach, describe, expect, mock, test } from 'bun:test'

import { addAgentStep, finishAgentRun, startAgentRun } from '../database'
import { getModelForRequest } from '../model-provider'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const originalFetch = globalThis.fetch
const logger = {
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
} as unknown as Logger

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
})

describe('SDK delegated user headers', () => {
  test('sends userId on model requests', async () => {
    const { model } = await getModelForRequest({
      apiKey: 'service-key',
      model: 'test/model',
      userId: 'end-user',
      skipChatGptOAuth: true,
    })

    expect((model as any).config.headers()).toMatchObject({
      Authorization: 'Bearer service-key',
      [FREEBUFF_ACTING_USER_HEADER]: 'end-user',
    })
  })

  test('sends userId on agent run and step requests', async () => {
    const requests: RequestInit[] = []
    globalThis.fetch = mock(async (_input, init) => {
      requests.push(init ?? {})
      const body = JSON.parse(String(init?.body))
      return Response.json(
        body.action === 'START'
          ? { runId: 'run-1' }
          : body.stepNumber !== undefined
            ? { stepId: 'step-1' }
            : { success: true },
      )
    }) as unknown as typeof fetch

    await startAgentRun({
      apiKey: 'service-key',
      userId: 'end-user',
      agentId: 'agent',
      ancestorRunIds: [],
      logger,
    })
    await finishAgentRun({
      apiKey: 'service-key',
      userId: 'end-user',
      runId: 'run-1',
      status: 'completed',
      totalSteps: 1,
      directCredits: 1,
      totalCredits: 1,
      logger,
    })
    await addAgentStep({
      apiKey: 'service-key',
      userId: 'end-user',
      agentRunId: 'run-1',
      stepNumber: 1,
      messageId: null,
      startTime: new Date(),
      logger,
    })

    expect(requests).toHaveLength(3)
    for (const request of requests) {
      expect(request.headers).toMatchObject({
        [FREEBUFF_ACTING_USER_HEADER]: 'end-user',
      })
    }
  })

  test('omits the internal header when userId is not supplied', async () => {
    let headers: HeadersInit | undefined
    globalThis.fetch = mock(async (_input, init) => {
      headers = init?.headers
      return Response.json({ runId: 'run-1' })
    }) as unknown as typeof fetch

    await startAgentRun({
      apiKey: 'user-key',
      agentId: 'agent',
      ancestorRunIds: [],
      logger,
    })

    expect(headers).not.toHaveProperty(FREEBUFF_ACTING_USER_HEADER)
  })
})
