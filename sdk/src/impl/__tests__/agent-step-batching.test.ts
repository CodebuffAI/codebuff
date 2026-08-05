import { afterEach, describe, expect, mock, test } from 'bun:test'
import { MAX_AGENT_STEP_ROWS } from '@codebuff/common/constants/agents'

import { addAgentStep, finishAgentRun } from '../database'

import type {
  AddAgentStepFn,
  FinishAgentRunFn,
} from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const originalFetch = globalThis.fetch
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as Logger

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
})

function step(
  runId: string,
  stepNumber: number,
): Parameters<AddAgentStepFn>[0] {
  return {
    apiKey: 'key',
    userId: 'user',
    agentRunId: runId,
    stepNumber,
    messageId: null,
    startTime: new Date('2026-08-05T12:00:00.000Z'),
    logger,
  }
}

function finishedRun(runId: string): Parameters<FinishAgentRunFn>[0] {
  return {
    apiKey: 'key',
    userId: 'user',
    runId,
    status: 'completed',
    totalSteps: 3,
    directCredits: 1,
    totalCredits: 1,
    logger,
  }
}

function captureRequestBodies(): unknown[] {
  const bodies: unknown[] = []
  globalThis.fetch = mock(async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    return Response.json({ success: true })
  }) as unknown as typeof fetch
  return bodies
}

describe('agent step batching', () => {
  test('includes all pending steps in the finish request', async () => {
    const bodies = captureRequestBodies()
    const runId = 'tail-run'

    await addAgentStep(step(runId, 1))
    await addAgentStep(step(runId, 2))
    await addAgentStep(step(runId, 3))
    expect(bodies).toHaveLength(0)

    await finishAgentRun(finishedRun(runId))

    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({
      action: 'FINISH',
      runId,
      steps: [{ stepNumber: 1 }, { stepNumber: 2 }, { stepNumber: 3 }],
    })
    expect(
      (bodies[0] as { steps: Array<{ id: string; startTime: string }> }).steps,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          startTime: '2026-08-05T12:00:00.000Z',
        }),
      ]),
    )
  })

  test('snapshots mutable step inputs when the step completes', async () => {
    const bodies = captureRequestBodies()
    const childRunIds = ['child-1']
    const startTime = new Date('2026-08-05T12:00:00.000Z')

    await addAgentStep({
      ...step('snapshot-run', 1),
      childRunIds,
      startTime,
    })
    childRunIds.push('child-2')
    startTime.setUTCFullYear(2030)

    await finishAgentRun(finishedRun('snapshot-run'))

    expect(bodies[0]).toMatchObject({
      steps: [
        {
          childRunIds: ['child-1'],
          startTime: '2026-08-05T12:00:00.000Z',
        },
      ],
    })
  })

  test('does not let an invalid step timestamp poison run completion', async () => {
    const bodies = captureRequestBodies()
    const result = await addAgentStep({
      ...step('invalid-date-run', 1),
      startTime: new Date(Number.NaN),
    })

    await finishAgentRun(finishedRun('invalid-date-run'))

    expect(result).toBeNull()
    expect(bodies[0]).toMatchObject({
      action: 'FINISH',
      runId: 'invalid-date-run',
      steps: [],
    })
  })

  test('keeps concurrent runs isolated and clears each finished buffer', async () => {
    const bodies = captureRequestBodies()

    await addAgentStep(step('run-a', 1))
    await addAgentStep(step('run-b', 2))
    await finishAgentRun(finishedRun('run-a'))
    await finishAgentRun(finishedRun('run-b'))
    await finishAgentRun(finishedRun('run-a'))

    expect(
      bodies.map((body) => (body as { steps: unknown[] }).steps.length),
    ).toEqual([1, 1, 0])
    expect(bodies[0]).toMatchObject({
      runId: 'run-a',
      steps: [{ stepNumber: 1 }],
    })
    expect(bodies[1]).toMatchObject({
      runId: 'run-b',
      steps: [{ stepNumber: 2 }],
    })
  })

  test('bounds the number of buffered steps per run', async () => {
    const bodies = captureRequestBodies()
    const runId = 'bounded-steps-run'

    for (let index = 0; index < MAX_AGENT_STEP_ROWS; index++) {
      expect(await addAgentStep(step(runId, index + 1))).not.toBeNull()
    }
    expect(
      await addAgentStep(step(runId, MAX_AGENT_STEP_ROWS + 1)),
    ).toBeNull()

    await finishAgentRun(finishedRun(runId))

    expect((bodies[0] as { steps: unknown[] }).steps).toHaveLength(
      MAX_AGENT_STEP_ROWS,
    )
  })

  test('evicts the oldest abandoned run when the buffer map is full', async () => {
    const selectedBodies: Array<{ runId: string; steps: unknown[] }> = []
    globalThis.fetch = mock(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        runId: string
        steps: unknown[]
      }
      if (body.runId === 'abandoned-0' || body.runId === 'abandoned-1000') {
        selectedBodies.push(body)
      }
      return Response.json({ success: true })
    }) as unknown as typeof fetch

    for (let index = 0; index <= 1_000; index++) {
      await addAgentStep(step(`abandoned-${index}`, 1))
    }
    await finishAgentRun(finishedRun('abandoned-0'))
    await finishAgentRun(finishedRun('abandoned-1000'))
    for (let index = 1; index < 1_000; index++) {
      await finishAgentRun(finishedRun(`abandoned-${index}`))
    }

    expect(selectedBodies).toHaveLength(2)
    expect(selectedBodies[0]).toMatchObject({
      runId: 'abandoned-0',
      steps: [],
    })
    expect(selectedBodies[1]).toMatchObject({
      runId: 'abandoned-1000',
      steps: [expect.any(Object)],
    })
  })
})
