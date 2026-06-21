import { describe, expect, test } from 'bun:test'

import { createReviewer } from '../reviewer/code-reviewer'

describe('code-reviewer prompt isolation', () => {
  test('does not inherit parent orchestration instructions', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.inheritParentSystemPrompt).toBe(false)
    // Reviewers may read files (only) so they can always gather full final-file
    // context instead of reviewing from partial diff fragments. No mutating or
    // control tools are granted.
    expect(reviewer.toolNames).toEqual(['read_files'])
    expect(reviewer.spawnableAgents).toEqual([])
  })

  test('instructs reviewer to read exact final files instead of diff fragments', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.instructionsPrompt).toContain('Always gather complete context')
    expect(reviewer.instructionsPrompt).toContain('diff fragments')
    expect(reviewer.instructionsPrompt).toContain('read_files with ranges')
  })

  test('requires verdict label as first visible final-answer token', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.instructionsPrompt).not.toContain(
      'Before providing your review, use <think></think> tags',
    )
    expect(reviewer.instructionsPrompt).toContain(
      'The first visible token of your final answer must be exactly `BLOCKING:`, `NON_BLOCKING:`, or `LOOKS_GOOD:`',
    )
    expect(reviewer.instructionsPrompt).toContain(
      'Do not emit any visible preamble, reasoning, or `<think>`/`</think>` tags before that label',
    )
  })

  test('treats missing parallel validation output as unavailable', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.instructionsPrompt).toContain(
      'Validation and other subagent work may be running in parallel',
    )
    expect(reviewer.instructionsPrompt).toContain(
      'You cannot observe results from parallel agents unless the prompt explicitly includes those completed results',
    )
    expect(reviewer.instructionsPrompt).toContain(
      'treat your review as static code review only',
    )
    expect(reviewer.instructionsPrompt).toContain(
      'do not say validation passed or failed',
    )
    expect(reviewer.instructionsPrompt).toContain(
      'Do not infer test, typecheck, lint, build, or basher status from silence',
    )
  })
})
