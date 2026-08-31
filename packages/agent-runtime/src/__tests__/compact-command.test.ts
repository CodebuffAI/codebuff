import { describe, expect, it } from 'bun:test'

import {
  additionalSystemPrompts,
  isCompactCommandPrompt,
} from '../system-prompt/prompts'

describe('isCompactCommandPrompt', () => {
  it('matches exactly the prompts that receive the summarize instruction', () => {
    // The history-replacing branch in run-agent-step keys off this predicate,
    // and the instruction injection keys off `prompt in additionalSystemPrompts`
    // — this test is what keeps the two from diverging again. A trigger that
    // matches MORE prompts than the map injects for (the old lowercased
    // comparison matched '/Compact') replaces the whole history with an
    // ordinary answer instead of a summary.
    for (const prompt of Object.keys(additionalSystemPrompts)) {
      const injectsCompact =
        additionalSystemPrompts[
          prompt as keyof typeof additionalSystemPrompts
        ] === additionalSystemPrompts['/compact']
      expect(isCompactCommandPrompt(prompt)).toBe(injectsCompact)
    }
  })

  it('accepts both deliverable spellings', () => {
    // The bare word is the only spelling the CLI can deliver: unregistered
    // slash commands are rejected client-side with "Command not found".
    expect(isCompactCommandPrompt('/compact')).toBe(true)
    expect(isCompactCommandPrompt('compact')).toBe(true)
  })

  it('rejects everything the injection would not have handled', () => {
    for (const prompt of [
      '/Compact',
      '/COMPACT',
      'Compact',
      'compact this file',
      ' compact',
      '/init',
      'export',
      '',
      undefined,
    ]) {
      expect(isCompactCommandPrompt(prompt)).toBe(false)
    }
  })
})
