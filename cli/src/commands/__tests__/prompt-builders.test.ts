import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Stub the ChatGPT OAuth status so we can drive both branches of the
// connected/not-connected prompt selection deterministically.
let connected = false
mock.module('../../utils/chatgpt-oauth', () => ({
  getChatGptOAuthStatus: () => ({ connected }),
}))

import {
  buildPlanPrompt,
  buildReviewPrompt,
  buildReviewPromptFromArgs,
} from '../prompt-builders'

describe('prompt-builders ChatGPT-aware base prompts', () => {
  beforeEach(() => {
    connected = false
  })

  describe('when ChatGPT is connected', () => {
    beforeEach(() => {
      connected = true
    })

    test('/plan delegates to @thinker-gpt', () => {
      expect(buildPlanPrompt('add OAuth login')).toContain('@thinker-gpt')
    })

    test('/review delegates to @thinker-gpt', () => {
      expect(buildReviewPrompt('uncommitted')).toContain('@thinker-gpt')
      expect(buildReviewPromptFromArgs('the parser')).toContain('@thinker-gpt')
    })
  })

  describe('when ChatGPT is not connected', () => {
    test('/plan runs on the selected model (no @thinker-gpt spawn)', () => {
      const prompt = buildPlanPrompt('add OAuth login')
      expect(prompt).not.toContain('@thinker-gpt')
      expect(prompt).toContain('add OAuth login')
    })

    test('/review runs on the selected model (no @thinker-gpt spawn)', () => {
      expect(buildReviewPrompt('uncommitted')).not.toContain('@thinker-gpt')
      expect(buildReviewPromptFromArgs('the parser')).not.toContain(
        '@thinker-gpt',
      )
    })
  })

  test('user input is preserved regardless of connection state', () => {
    connected = true
    expect(buildPlanPrompt('do the thing')).toContain('do the thing')
    connected = false
    expect(buildPlanPrompt('do the thing')).toContain('do the thing')
  })
})
