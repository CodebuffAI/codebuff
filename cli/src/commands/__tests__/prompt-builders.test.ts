import { describe, expect, test } from 'bun:test'

import {
  buildPlanPrompt,
  buildReviewPrompt,
  buildReviewPromptFromArgs,
} from '../prompt-builders'

describe('prompt-builders base prompts', () => {
  // These used to branch on whether the user had connected a ChatGPT account,
  // delegating the deep-thinking step to @thinker-gpt if so. That integration
  // is gone, so there is one branch: the user's selected model does the work.
  test('/plan runs on the selected model', () => {
    const prompt = buildPlanPrompt('add OAuth login')
    expect(prompt).not.toContain('@thinker-gpt')
    expect(prompt).toContain('think carefully about how to implement')
    expect(prompt).toContain('add OAuth login')
  })

  test('/review runs on the selected model', () => {
    expect(buildReviewPrompt('uncommitted')).not.toContain('@thinker-gpt')
    expect(buildReviewPrompt('uncommitted')).toContain('carefully review')
    expect(buildReviewPromptFromArgs('the parser')).not.toContain(
      '@thinker-gpt',
    )
    expect(buildReviewPromptFromArgs('the parser')).toContain('the parser')
  })
})
