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

  test('non-polling tool result changes reset the repeat count', () => {
    const first = evaluateRepeatedStepLoop({
      toolCalls: [{ toolName: 'read_files', input: { paths: ['a.ts'] } }],
      toolResults: [{ toolName: 'read_files', content: 'old contents' }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    const changed = evaluateRepeatedStepLoop({
      previousSignature: first.signature,
      previousRepeatCount: first.repeatCount,
      toolCalls: [{ toolName: 'read_files', input: { paths: ['a.ts'] } }],
      toolResults: [{ toolName: 'read_files', content: 'new contents' }],
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

  test('varied check_job polls of one job increment repeatCount until the limit', () => {
    let signature: string | undefined
    let repeatCount = 0
    const variations = [
      { wait_for: 'ready', timeout_seconds: 30, cursor: '0' },
      { wait_for: 'running', timeout_seconds: 60, cursor: '10' },
      { wait_for: 'done', timeout_seconds: 90 },
      { cursor: '20' },
      { wait_for: 'ready', timeout_seconds: 5, cursor: '30' },
      { wait_for: 'ready', cursor: '40' },
    ]
    const outputs = [
      'still building',
      'linking',
      'rendering 50%',
      'rendering 80%',
      'writing frames',
      'done',
    ]
    const signatures: (string | undefined)[] = []
    let shouldStop = false

    for (let index = 0; index < variations.length; index++) {
      const result = evaluateRepeatedStepLoop({
        previousSignature: signature,
        previousRepeatCount: repeatCount,
        toolCalls: [
          {
            toolName: 'check_job',
            input: { jobId: 'render-1', ...variations[index] },
          },
        ],
        toolResults: [{ toolName: 'check_job', content: outputs[index] }],
        isThinkOnly: false,
        responseText: '',
        shouldEndTurn: false,
      })
      signature = result.signature
      repeatCount = result.repeatCount
      shouldStop = result.shouldStop
      signatures.push(result.signature)
    }

    // All normalized poll signatures collapse to the same digest even though
    // wait_for/timeout/cursor and the returned content differ every step.
    expect(new Set(signatures.filter(Boolean)).size).toBe(1)
    expect(repeatCount).toBe(variations.length)
    expect(shouldStop).toBe(true)
  })

  test('varied check_background_agent polls of one job increment repeatCount until the limit', () => {
    let signature: string | undefined
    let repeatCount = 0
    const variations = [
      { wait_for: 'complete', timeout_seconds: 30 },
      { wait_for: undefined },
      { timeout_seconds: 60 },
      {},
      { wait_for: 'idle' },
      { timeout_seconds: 10 },
    ]
    const outputs = [
      'working',
      'thinking',
      'reviewing',
      'writing',
      'summarizing',
      'done',
    ]
    let shouldStop = false

    for (let index = 0; index < variations.length; index++) {
      const result = evaluateRepeatedStepLoop({
        previousSignature: signature,
        previousRepeatCount: repeatCount,
        toolCalls: [
          {
            toolName: 'check_background_agent',
            input: { jobId: 'bg-1', ...variations[index] },
          },
        ],
        toolResults: [
          { toolName: 'check_background_agent', content: outputs[index] },
        ],
        isThinkOnly: false,
        responseText: '',
        shouldEndTurn: false,
      })
      signature = result.signature
      repeatCount = result.repeatCount
      shouldStop = result.shouldStop
    }

    expect(repeatCount).toBe(variations.length)
    expect(shouldStop).toBe(true)
  })

  test('read_logs polls of one jobId increment repeatCount until the limit', () => {
    let signature: string | undefined
    let repeatCount = 0
    const chunks = [['a'], ['a', 'b'], ['b', 'c'], ['c'], ['d'], ['e', 'f']]
    const cursors = ['0', '5', '12', '20', '30', '45']
    let shouldStop = false

    for (let index = 0; index < chunks.length; index++) {
      const result = evaluateRepeatedStepLoop({
        previousSignature: signature,
        previousRepeatCount: repeatCount,
        toolCalls: [
          {
            toolName: 'read_logs',
            input: { jobId: 'log-1', cursor: cursors[index] },
          },
        ],
        toolResults: [{ toolName: 'read_logs', content: chunks[index] }],
        isThinkOnly: false,
        responseText: '',
        shouldEndTurn: false,
      })
      signature = result.signature
      repeatCount = result.repeatCount
      shouldStop = result.shouldStop
    }

    expect(repeatCount).toBe(chunks.length)
    expect(shouldStop).toBe(true)
  })

  test('a different jobId resets the repeat count', () => {
    const a1 = evaluateRepeatedStepLoop({
      toolCalls: [{ toolName: 'check_job', input: { jobId: 'job-a' } }],
      toolResults: [{ toolName: 'check_job', content: 'running' }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    const a2 = evaluateRepeatedStepLoop({
      previousSignature: a1.signature,
      previousRepeatCount: a1.repeatCount,
      toolCalls: [{ toolName: 'check_job', input: { jobId: 'job-a' } }],
      toolResults: [{ toolName: 'check_job', content: 'still running' }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    expect(a2.repeatCount).toBe(2)

    const b = evaluateRepeatedStepLoop({
      previousSignature: a2.signature,
      previousRepeatCount: a2.repeatCount,
      toolCalls: [{ toolName: 'check_job', input: { jobId: 'job-b' } }],
      toolResults: [{ toolName: 'check_job', content: 'running' }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    expect(b.repeatCount).toBe(1)
    expect(b.shouldStop).toBe(false)
  })

  test('read_logs without a jobId is not normalized as polling', () => {
    const first = evaluateRepeatedStepLoop({
      toolCalls: [{ toolName: 'read_logs', input: { path: 'app.log' } }],
      toolResults: [{ toolName: 'read_logs', content: ['line1'] }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    const changed = evaluateRepeatedStepLoop({
      previousSignature: first.signature,
      previousRepeatCount: first.repeatCount,
      toolCalls: [{ toolName: 'read_logs', input: { path: 'app.log' } }],
      toolResults: [{ toolName: 'read_logs', content: ['line1', 'line2'] }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    // Path-keyed read_logs keeps raw input/output, so a content change resets.
    expect(changed.repeatCount).toBe(1)
    expect(changed.shouldStop).toBe(false)
  })

  test('mixed polling + non-polling same step: only the polling result is marker-replaced', () => {
    // One polling check_job(jobId) and one non-polling read_files result in
    // the same step. The polling result content must be normalized (so varying
    // poll output is stable) while the read_files content is preserved
    // verbatim (so it contributes to the signature and changes reset the
    // count). Both toolNames appear in the normalized signature payload.
    const pollingContentA = 'rendering 50%'
    const readFilesContent = 'verbatim file body'
    const mixedA = evaluateRepeatedStepLoop({
      toolCalls: [
        { toolName: 'check_job', input: { jobId: 'render-1' } },
        { toolName: 'read_files', input: { paths: ['out.png'] } },
      ],
      toolResults: [
        { toolName: 'check_job', content: pollingContentA },
        { toolName: 'read_files', content: readFilesContent },
      ],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })

    // (a) Changing only the polling content must NOT change the signature:
    // the check_job result is marker-replaced so its varying output is folded
    // into the stable (toolName, jobId) signature.
    const pollingContentB = 'rendering 80%'
    const mixedB_pollChanged = evaluateRepeatedStepLoop({
      previousSignature: mixedA.signature,
      previousRepeatCount: mixedA.repeatCount,
      toolCalls: [
        { toolName: 'check_job', input: { jobId: 'render-1' } },
        { toolName: 'read_files', input: { paths: ['out.png'] } },
      ],
      toolResults: [
        { toolName: 'check_job', content: pollingContentB },
        { toolName: 'read_files', content: readFilesContent },
      ],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    expect(mixedB_pollChanged.signature).toBe(mixedA.signature)
    expect(mixedB_pollChanged.repeatCount).toBe(2)
    expect(mixedB_pollChanged.shouldStop).toBe(false)

    // (b) Changing the read_files content must reset the count, proving the
    // read_files content is preserved verbatim in the signature payload
    // (not marker-replaced).
    const mixedC_readChanged = evaluateRepeatedStepLoop({
      previousSignature: mixedB_pollChanged.signature,
      previousRepeatCount: mixedB_pollChanged.repeatCount,
      toolCalls: [
        { toolName: 'check_job', input: { jobId: 'render-1' } },
        { toolName: 'read_files', input: { paths: ['out.png'] } },
      ],
      toolResults: [
        { toolName: 'check_job', content: pollingContentB },
        { toolName: 'read_files', content: 'different file body' },
      ],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    expect(mixedC_readChanged.signature).not.toBe(mixedB_pollChanged.signature)
    expect(mixedC_readChanged.repeatCount).toBe(1)
    expect(mixedC_readChanged.shouldStop).toBe(false)

    // (c) Both toolNames appear in the signature payload: a polling-only step
    // (check_job alone) and a read-only step (read_files alone) each produce
    // a signature distinct from the mixed step, so the mixed signature must
    // depend on the presence of BOTH tool entries.
    const pollOnly = evaluateRepeatedStepLoop({
      toolCalls: [{ toolName: 'check_job', input: { jobId: 'render-1' } }],
      toolResults: [{ toolName: 'check_job', content: pollingContentA }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    const readOnly = evaluateRepeatedStepLoop({
      toolCalls: [{ toolName: 'read_files', input: { paths: ['out.png'] } }],
      toolResults: [{ toolName: 'read_files', content: readFilesContent }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    expect(mixedA.signature).not.toBe(pollOnly.signature)
    expect(mixedA.signature).not.toBe(readOnly.signature)
  })

  test('results in a different order than calls are correlated by toolCallId', () => {
    // processStream may return toolResults out of call order for parallel /
    // out-of-order batches. With toolCallIds on every call and every result,
    // the marker must land on the result that actually came from the polling
    // call regardless of result ordering. The non-polling result stays raw.
    const checkJobContentA = 'rendering 50%'
    const checkJobContentB = 'rendering 90%'
    const readFilesContent = 'file body'

    // Call order: [check_job, read_files]; result order: [read_files, check_job]
    const first = evaluateRepeatedStepLoop({
      toolCalls: [
        {
          toolName: 'check_job',
          input: { jobId: 'render-1' },
          toolCallId: 'call_check',
        },
        {
          toolName: 'read_files',
          input: { paths: ['out.png'] },
          toolCallId: 'call_read',
        },
      ],
      toolResults: [
        {
          toolName: 'read_files',
          content: readFilesContent,
          toolCallId: 'call_read',
        },
        {
          toolName: 'check_job',
          content: checkJobContentA,
          toolCallId: 'call_check',
        },
      ],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })

    // Only the check_job result is normalized; changing its content must not
    // change the signature (marker-replaced, result order swapped again to
    // prove correlation is by id, not position).
    const second = evaluateRepeatedStepLoop({
      previousSignature: first.signature,
      previousRepeatCount: first.repeatCount,
      toolCalls: [
        {
          toolName: 'check_job',
          input: { jobId: 'render-1' },
          toolCallId: 'call_check',
        },
        {
          toolName: 'read_files',
          input: { paths: ['out.png'] },
          toolCallId: 'call_read',
        },
      ],
      toolResults: [
        {
          toolName: 'check_job',
          content: checkJobContentB,
          toolCallId: 'call_check',
        },
        {
          toolName: 'read_files',
          content: readFilesContent,
          toolCallId: 'call_read',
        },
      ],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    expect(second.signature).toBe(first.signature)
    expect(second.repeatCount).toBe(2)
    expect(second.shouldStop).toBe(false)

    // The read_files result stays raw: changing its content resets the count
    // even when it's the first result (non-polling position).
    const third = evaluateRepeatedStepLoop({
      previousSignature: second.signature,
      previousRepeatCount: second.repeatCount,
      toolCalls: [
        {
          toolName: 'check_job',
          input: { jobId: 'render-1' },
          toolCallId: 'call_check',
        },
        {
          toolName: 'read_files',
          input: { paths: ['out.png'] },
          toolCallId: 'call_read',
        },
      ],
      toolResults: [
        {
          toolName: 'read_files',
          content: 'changed file body',
          toolCallId: 'call_read',
        },
        {
          toolName: 'check_job',
          content: checkJobContentB,
          toolCallId: 'call_check',
        },
      ],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    expect(third.signature).not.toBe(second.signature)
    expect(third.repeatCount).toBe(1)
    expect(third.shouldStop).toBe(false)
  })

  test('length mismatch between calls and results leaves poll content raw when no ids', () => {
    // Without toolCallIds, a length mismatch makes positional correlation
    // ambiguous: the normalizer must NOT apply the polling marker by index,
    // otherwise it could mark a result that did not come from the polling
    // call. Two check_job calls (both polling) but only one result: the
    // single result keeps its raw content, so changing the result content
    // produces a different signature (proving it was NOT marker-replaced).
    const rawA = evaluateRepeatedStepLoop({
      toolCalls: [
        { toolName: 'check_job', input: { jobId: 'render-1' } },
        { toolName: 'check_job', input: { jobId: 'render-2' } },
      ],
      toolResults: [{ toolName: 'check_job', content: 'output A' }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    const rawB = evaluateRepeatedStepLoop({
      toolCalls: [
        { toolName: 'check_job', input: { jobId: 'render-1' } },
        { toolName: 'check_job', input: { jobId: 'render-2' } },
      ],
      toolResults: [{ toolName: 'check_job', content: 'output B' }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    // Same call set + same result toolName, only the result content differs.
    // If the marker were applied at result index 0, both signatures would be
    // equal. Because lengths mismatch (2 calls, 1 result) and there are no
    // ids, correlation is ambiguous and the result content stays RAW — so a
    // content change yields a different signature.
    expect(rawB.signature).not.toBe(rawA.signature)
    expect(rawB.repeatCount).toBe(1)
    expect(rawB.shouldStop).toBe(false)

    // Contrast: with matching lengths and no ids, positional correlation
    // applies and the poll result at index 0 IS marker-replaced, so changing
    // its content does NOT change the signature.
    const matchedA = evaluateRepeatedStepLoop({
      toolCalls: [{ toolName: 'check_job', input: { jobId: 'render-1' } }],
      toolResults: [{ toolName: 'check_job', content: 'output A' }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    const matchedB = evaluateRepeatedStepLoop({
      previousSignature: matchedA.signature,
      previousRepeatCount: matchedA.repeatCount,
      toolCalls: [{ toolName: 'check_job', input: { jobId: 'render-1' } }],
      toolResults: [{ toolName: 'check_job', content: 'output B' }],
      isThinkOnly: false,
      responseText: '',
      shouldEndTurn: false,
    })
    expect(matchedB.signature).toBe(matchedA.signature)
    expect(matchedB.repeatCount).toBe(2)
    expect(matchedB.shouldStop).toBe(false)
  })
})
