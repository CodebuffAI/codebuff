import { describe, expect, test } from 'bun:test'

import { createReviewer } from '../reviewer/code-reviewer'

describe('code-reviewer prompt isolation', () => {
  test('does not inherit parent orchestration instructions', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.inheritParentSystemPrompt).toBe(false)
    expect(reviewer.toolNames).toEqual([])
    expect(reviewer.spawnableAgents).toEqual([])
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
