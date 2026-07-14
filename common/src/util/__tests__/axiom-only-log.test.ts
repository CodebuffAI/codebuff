import { describe, expect, test } from 'bun:test'

import {
  CONTEXT_PRUNING_COMPLETED_EVENT,
  getAxiomOnlyLogEvent,
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
})
