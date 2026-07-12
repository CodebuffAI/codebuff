import { describe, expect, test } from 'bun:test'

import { createReviewer } from '../reviewer/code-reviewer'

describe('code-reviewer prompt isolation', () => {
  test('uses structured output when an output schema is declared', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')
    expect(reviewer.outputMode).toBe('structured_output')
    expect(reviewer.outputSchema).toBeDefined()
  })

  test('does not inherit parent orchestration instructions', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.inheritParentSystemPrompt).toBe(false)
    // Reviewers may read files (only) so they can always gather full final-file
    // context instead of reviewing from partial diff fragments. No mutating or
    // control tools are granted.
    expect(reviewer.toolNames).toEqual(['read_files', 'set_output'])
    expect(reviewer.spawnableAgents).toEqual([])
  })

  test('instructs reviewer to read exact final files instead of diff fragments', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.instructionsPrompt).toContain(
      'Always gather complete context',
    )
    expect(reviewer.instructionsPrompt).toContain('diff fragments')
    expect(reviewer.instructionsPrompt).toContain('read_files with ranges')
  })

  test('requires set_output instead of an ambiguous textual verdict', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.instructionsPrompt).toContain(
      'You must call `set_output` with one object that satisfies the declared output schema',
    )
    expect(reviewer.instructionsPrompt).toContain(
      'the parent will receive `null`',
    )
    expect(reviewer.instructionsPrompt).not.toContain(
      'The first visible token of your final answer',
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

  // M2.4: 3-item security checklist + coverage-adequacy line.
  test('includes a 3-item security checklist', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.instructionsPrompt).toContain('Security checklist')
    expect(reviewer.instructionsPrompt).toContain('Input boundary')
    expect(reviewer.instructionsPrompt).toContain('Secret handling')
    expect(reviewer.instructionsPrompt).toContain('Failure mode')
    // All three numbered items present.
    expect(reviewer.instructionsPrompt).toMatch(/1\. Input boundary/)
    expect(reviewer.instructionsPrompt).toMatch(/2\. Secret handling/)
    expect(reviewer.instructionsPrompt).toMatch(/3\. Failure mode/)
  })

  test('includes a coverage-adequacy guideline', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.instructionsPrompt).toContain('Coverage adequacy')
    // Must name a specific test file rather than a vague suggestion.
    expect(reviewer.instructionsPrompt).toContain('name the specific test file')
    // Must not assert pass/fail — only coverage existence.
    expect(reviewer.instructionsPrompt).toContain(
      'Do not assert that tests pass or fail',
    )
  })

  // M6.3: coverage-adequacy promoted to the verdict contract (BLOCKING-eligible).
  test('promotes coverage-adequacy into the verdict contract', () => {
    const reviewer = createReviewer('anthropic/claude-opus-4.7')

    expect(reviewer.instructionsPrompt).toContain(
      'Missing test coverage for a behavior-changing edit requires',
    )
    expect(reviewer.instructionsPrompt).toContain(
      '`verdict: "BLOCKING"` and `coverage: "missing"`',
    )
    // Coverage adequacy guideline is explicitly marked as verdict-contract.
    expect(reviewer.instructionsPrompt).toContain('verdict-contract, M6.3')
    expect(reviewer.instructionsPrompt).toContain('coverage: "missing"')
  })
})
