import { describe, expect, test } from 'bun:test'

import {
  CONTEXT_PRUNING_COMPLETED_EVENT,
  getAxiomOnlyLogEvent,
  STREAM_RECOVERY_EVENT,
} from '../axiom-only-log'

describe('getAxiomOnlyLogEvent', () => {
  test('sanitizes context-pruning metadata', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: CONTEXT_PRUNING_COMPLETED_EVENT,
        trigger_reason: 'context_limit',
        client_session_id: 'turn-123',
        dropped_user_entry_count: 2,
        live_user_prompt_text_preserved: true,
        prompt: 'must not leave the client',
        nested: { secret: true },
        context_token_count: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      event: CONTEXT_PRUNING_COMPLETED_EVENT,
      data: {
        trigger_reason: 'context_limit',
        client_session_id: 'turn-123',
        dropped_user_entry_count: 2,
        live_user_prompt_text_preserved: true,
      },
    })
  })

  test('does not treat arbitrary events as Axiom-only', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: 'untrusted.event',
        prompt: 'secret',
      }),
    ).toBeNull()
  })

  test('does not treat an Object.prototype property name as a registered event', () => {
    // The event name is caller-supplied (any logger.*(data, msg) call sets
    // `data.axiomEvent`). Guards against ever matching it with a lookup keyed
    // on that name (e.g. a plain-object registry), where 'constructor' would
    // resolve through the prototype chain and get treated as registered —
    // shipping `{}` in place of the log's real payload. Must be rejected like
    // any other unknown event, via both the data-field and event-param path.
    for (const poisonEvent of [
      'constructor',
      'toString',
      'hasOwnProperty',
      'valueOf',
      '__proto__',
    ]) {
      expect(
        getAxiomOnlyLogEvent({
          axiomEvent: poisonEvent,
          prompt: 'must not be silently dropped',
        }),
      ).toBeNull()
      expect(
        getAxiomOnlyLogEvent({ prompt: 'must not be silently dropped' }, poisonEvent),
      ).toBeNull()
    }
  })

  test('sanitizes the client wire format identified by its top-level event', () => {
    expect(
      getAxiomOnlyLogEvent(
        {
          dropped_user_entry_count: 2,
          prompt: 'must not reach Axiom',
        },
        CONTEXT_PRUNING_COMPLETED_EVENT,
      ),
    ).toEqual({
      event: CONTEXT_PRUNING_COMPLETED_EVENT,
      data: { dropped_user_entry_count: 2 },
    })
  })

  test('accepts an allowlisted top-level event with empty data', () => {
    expect(getAxiomOnlyLogEvent(null, CONTEXT_PRUNING_COMPLETED_EVENT)).toEqual(
      {
        event: CONTEXT_PRUNING_COMPLETED_EVENT,
        data: {},
      },
    )
  })

  test('sanitizes stream-recovery metadata', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: STREAM_RECOVERY_EVENT,
        metric: 'stream_recovery_detected',
        source: 'stream-interrupted',
        model: 'openrouter/anthropic/claude-sonnet-4.5',
        agentId: 'base2',
        runId: 'run-123',
        userInputId: 'input-456',
        finishReason: 'unknown',
        hasYieldedContent: true,
        consecutive: 2,
        // Not in the allowlist: must not leak through.
        userId: 'user-789',
        message: 'must not leave the client',
        messageHistory: [{ role: 'user', content: 'secret' }],
      }),
    ).toEqual({
      event: STREAM_RECOVERY_EVENT,
      data: {
        metric: 'stream_recovery_detected',
        source: 'stream-interrupted',
        model: 'openrouter/anthropic/claude-sonnet-4.5',
        agentId: 'base2',
        runId: 'run-123',
        userInputId: 'input-456',
        finishReason: 'unknown',
        hasYieldedContent: true,
        consecutive: 2,
      },
    })
  })

  test('drops a stream-recovery field with the wrong value type', () => {
    // consecutive must be a number; a string value for it (or any other
    // type mismatch) is dropped rather than coerced.
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: STREAM_RECOVERY_EVENT,
        metric: 'stream_recovery_rescued',
        consecutive: '2',
      }),
    ).toEqual({
      event: STREAM_RECOVERY_EVENT,
      data: { metric: 'stream_recovery_rescued' },
    })
  })
})
