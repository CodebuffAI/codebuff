import { describe, expect, test } from 'bun:test'

import { createReviewer } from '../reviewer/code-reviewer'
import {
  createCodeReviewerMultiPrompt,
  formatReviewSummary,
} from '../reviewer/multi-prompt/code-reviewer-multi-prompt'

describe('code-reviewer multi-prompt output formatting', () => {
  test('formats multiple review texts as a readable summary', () => {
    const summary = formatReviewSummary([
      'LOOKS_GOOD: No blocking issues found.',
      'NON_BLOCKING: Consider adding one more test.',
    ])

    expect(summary).toBe(
      'Review 1:\nLOOKS_GOOD: No blocking issues found.\n\nReview 2:\nNON_BLOCKING: Consider adding one more test.',
    )
  })

  test('keeps a single review unchanged', () => {
    expect(formatReviewSummary(['LOOKS_GOOD: No blocking issues found.'])).toBe(
      'LOOKS_GOOD: No blocking issues found.',
    )
  })

  test('returns a readable fallback when no reviewers respond', () => {
    expect(formatReviewSummary([])).toBe('No reviewer output was returned.')
  })

  test('keeps summary formatter inside serialized handleSteps', () => {
    const reviewer = createCodeReviewerMultiPrompt()
    const serializedHandleSteps = String(reviewer.handleSteps)

    expect(serializedHandleSteps).toContain('formatReviewSummaryForHandleSteps')
    expect(serializedHandleSteps).not.toContain(
      'const message = formatReviewSummary(reviewTexts)',
    )
  })

  test('sets readable message and output fields alongside reviews', () => {
    const reviewer = createCodeReviewerMultiPrompt()
    const generator = reviewer.handleSteps!({
      params: { prompts: ['correctness'] },
      agentState: {
        agentId: 'code-reviewer-multi-prompt',
        runId: 'run-1',
        parentId: undefined,
        messageHistory: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'changed files' }],
          },
        ],
        output: undefined,
        systemPrompt: '',
        toolDefinitions: {},
        contextTokenCount: 0,
      },
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    })

    expect(generator.next().value).toMatchObject({ toolName: 'set_messages' })
    expect(generator.next().value).toMatchObject({ toolName: 'spawn_agents' })

    const setOutput = generator.next({
      agentState: {} as never,
      stepsComplete: false,
      toolResult: [
        {
          type: 'json',
          value: [
            {
              value: {
                value: [
                  {
                    role: 'assistant',
                    content: [
                      {
                        type: 'text',
                        text: 'LOOKS_GOOD: No blocking issues found.',
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    }).value

    expect(setOutput).toMatchObject({
      toolName: 'set_output',
      input: {
        message: 'LOOKS_GOOD: No blocking issues found.',
        output: 'LOOKS_GOOD: No blocking issues found.',
        reviews: ['LOOKS_GOOD: No blocking issues found.'],
      },
      includeToolCall: false,
    })
  })
})

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
