import { describe, expect, test } from 'bun:test'

import {
  evaluateRepeatedStepLoop,
  REPEATED_STEP_LOOP_LIMIT,
} from '../util/step-loop-guard'

describe('repeated-step loop guard', () => {
  test('stops only after the same tool and result pattern repeats', () => {
    let signature: string | undefined
    let repeatCount = 0

    for (let index = 1; index <= REPEATED_STEP_LOOP_LIMIT; index++) {
      const result = evaluateRepeatedStepLoop({
        previousSignature: signature,
        previousRepeatCount: repeatCount,
        toolCalls: [{ toolName: 'read_files', input: { paths: ['a.ts'] } }],
        toolResults: [
          {
            toolName: 'read_files',
            content: [{ type: 'json', value: 'same' }],
          },
        ],
        isThinkOnly: false,
        responseText: '',
        shouldEndTurn: false,
      })
      signature = result.signature
      repeatCount = result.repeatCount
      expect(result.shouldStop).toBe(index === REPEATED_STEP_LOOP_LIMIT)
    }
  })

  test('resets when a tool result changes', () => {
    const first = evaluateRepeatedStepLoop({
      toolCalls: [{ toolName: 'check_job', input: { jobId: 'job-1' } }],
      toolResults: [{ toolName: 'check_job', content: 'running' }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    const changed = evaluateRepeatedStepLoop({
      previousSignature: first.signature,
      previousRepeatCount: first.repeatCount,
      toolCalls: [{ toolName: 'check_job', input: { jobId: 'job-1' } }],
      toolResults: [{ toolName: 'check_job', content: 'completed' }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    expect(changed.repeatCount).toBe(1)
    expect(changed.shouldStop).toBe(false)
  })

  test('resets when the agent completes normally', () => {
    expect(
      evaluateRepeatedStepLoop({
        previousSignature: 'sha256:old',
        previousRepeatCount: REPEATED_STEP_LOOP_LIMIT - 1,
        toolCalls: [{ toolName: 'end_turn', input: {} }],
        toolResults: [],
        isThinkOnly: false,
        responseText: '',
        shouldEndTurn: true,
      }),
    ).toEqual({ signature: undefined, repeatCount: 0, shouldStop: false })
  })

  test('detects repeated text-only steps for explicit-completion agents', () => {
    let signature: string | undefined
    let repeatCount = 0
    let shouldStop = false

    for (let index = 0; index < REPEATED_STEP_LOOP_LIMIT; index++) {
      const result = evaluateRepeatedStepLoop({
        previousSignature: signature,
        previousRepeatCount: repeatCount,
        toolCalls: [],
        toolResults: [],
        isThinkOnly: false,
        responseText: 'Still working.',
        shouldEndTurn: false,
      })
      signature = result.signature
      repeatCount = result.repeatCount
      shouldStop = result.shouldStop
    }

    expect(shouldStop).toBe(true)
  })
})
