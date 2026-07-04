import { beforeEach, describe, expect, test } from 'bun:test'

import {
  buildPlanPrompt,
  buildReviewPrompt,
  buildReviewPromptFromArgs,
} from '../prompt-builders'

// Inject the ChatGPT connection state so we can drive both branches of the
// connected/not-connected prompt selection deterministically, without
// mocking the `chatgpt-oauth` module (mock.module() is process-global in
// Bun and leaks into unrelated test files run later in the same process).
let connected = false
const isChatGptConnected = () => connected

describe('prompt-builders ChatGPT-aware base prompts', () => {
  beforeEach(() => {
    connected = false
  })

  describe('when ChatGPT is connected', () => {
    beforeEach(() => {
      connected = true
    })

    test('/plan delegates to @thinker-gpt', () => {
      expect(
        buildPlanPrompt('add OAuth login', isChatGptConnected),
      ).toContain('@thinker-gpt')
    })

    test('/review delegates to @thinker-gpt', () => {
      expect(
        buildReviewPrompt('uncommitted', undefined, isChatGptConnected),
      ).toContain('@thinker-gpt')
      expect(
        buildReviewPromptFromArgs('the parser', isChatGptConnected),
      ).toContain('@thinker-gpt')
    })
  })

  describe('when ChatGPT is not connected', () => {
    test('/plan runs on the selected model (no @thinker-gpt spawn)', () => {
      const prompt = buildPlanPrompt('add OAuth login', isChatGptConnected)
      expect(prompt).not.toContain('@thinker-gpt')
      expect(prompt).toContain('add OAuth login')
    })

    test('/review runs on the selected model (no @thinker-gpt spawn)', () => {
      expect(
        buildReviewPrompt('uncommitted', undefined, isChatGptConnected),
      ).not.toContain('@thinker-gpt')
      expect(
        buildReviewPromptFromArgs('the parser', isChatGptConnected),
      ).not.toContain('@thinker-gpt')
    })
  })

  test('user input is preserved regardless of connection state', () => {
    connected = true
    expect(buildPlanPrompt('do the thing', isChatGptConnected)).toContain(
      'do the thing',
    )
    connected = false
    expect(buildPlanPrompt('do the thing', isChatGptConnected)).toContain(
      'do the thing',
    )
  })
})
