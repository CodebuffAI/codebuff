import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import { trimMessagesToFitTokenLimit, messagesWithSystem } from '../messages'
import * as tokenCounter from '../token-counter'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'

describe('messagesWithSystem', () => {
  it('prepends system message to array', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ] as Message[]
    const system = 'Be helpful'

    const result = messagesWithSystem(messages, system)

    expect(result).toEqual([
      { role: 'system', content: 'Be helpful' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])
  })
})

describe('trimMessagesToFitTokenLimit', () => {
  beforeEach(() => {
    // Mock countTokensJson to just count characters
    spyOn(tokenCounter, 'countTokensJson').mockImplementation((text) => {
      // Make token count high enough to trigger simplification
      return JSON.stringify(text).length
    })
  })

  afterEach(() => {
    mock.restore()
  })

  const testMessages = [
    // Regular message without tool calls - should never be shortened, but won't fit in the final array
    {
      role: 'assistant',
      content:
        'This is a long assistant message that would normally be shortened but since it has no tool calls it should be preserved completely intact no matter what',
    },
    // Regular message without tool calls - should never be shortened
    {
      role: 'user',
      content:
        'This is a long message that would normally be shortened but since it has no tool calls it should be preserved completely intact no matter what',
    },
    {
      role: 'user',
      content: [
        // Terminal output 0 (oldest) - should be simplified
        {
          type: 'text',
          text: `<tool_result>
<tool>run_terminal_command</tool>
<result>Terminal output 0${'.'.repeat(2000)}</result>
</tool_result>`,
        },
        // Terminal output 1 - should be preserved (shorter than '[Output omitted]')
        {
          type: 'text',
          text: `<tool_result>
<tool>run_terminal_command</tool>
<result>Short output 1</result>
</tool_result>`,
        },
      ],
    },
    // Terminal output 2 - should be simplified
    {
      role: 'user',
      content: `<tool_result>
<tool>run_terminal_command</tool>
<result>Terminal output 2${'.'.repeat(2000)}</result>
</tool_result>`,
    },
    // Terminal output 3 - should be preserved (5th most recent)
    {
      role: 'user',
      content: `<tool_result>
<tool>run_terminal_command</tool>
<result>Terminal output 3</result>
</tool_result>`,
    },
    {
      role: 'user',
      content: [
        // Terminal output 4 - should be preserved (4th most recent)
        {
          type: 'text',
          text: `<tool_result>
<tool>run_terminal_command</tool>
<result>Terminal output 4</result>
</tool_result>`,
        },
        // Regular message - should never be shortened
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: 'xyz',
          },
        },
        // Terminal output 5 - should be preserved (3rd most recent)
        {
          type: 'text',
          text: `<tool_result>
<tool>run_terminal_command</tool>
<result>Terminal output 5</result>
</tool_result>`,
        },
      ],
    },
    // Terminal output 6 - should be preserved (2nd most recent)
    {
      role: 'user',
      content: `<tool_result>
<tool>run_terminal_command</tool>
<result>Terminal output 6</result>
</tool_result>`,
    },
    // Terminal output 7 - should be preserved (most recent)
    {
      role: 'user',
      content: `<tool_result>
<tool>run_terminal_command</tool>
<result>Terminal output 7</result>
</tool_result>`,
    },
    // Regular message - should never be shortened
    {
      role: 'assistant',
      content: {
        type: 'text',
        text: 'Another long message that should never be shortened because it has no tool calls in it at all',
      },
    },
  ] as Message[]

  it('handles all features working together correctly', () => {
    const maxTotalTokens = 3000
    const systemTokens = 0
    const result = trimMessagesToFitTokenLimit(
      testMessages,
      systemTokens,
      maxTotalTokens,
    )

    // Should have replacement message for omitted content
    expect(result.length).toBeGreaterThan(0)

    // Should contain a replacement message for omitted content
    const hasReplacementMessage = result.some(
      (msg) =>
        typeof msg.content === 'string' &&
        msg.content.includes('Previous message(s) omitted due to length'),
    )
    expect(hasReplacementMessage).toBe(true)

    // Verify total tokens are under limit
    const finalTokens = tokenCounter.countTokensJson(result)
    expect(finalTokens).toBeLessThan((maxTotalTokens - systemTokens) * 0.5)
  })

  it('subtracts system tokens from total tokens', () => {
    const maxTotalTokens = 10_000
    const systemTokens = 7_000
    const result = trimMessagesToFitTokenLimit(
      testMessages,
      systemTokens,
      maxTotalTokens,
    )

    // Should have replacement message for omitted content
    expect(result.length).toBeGreaterThan(0)

    // Should contain a replacement message for omitted content
    const hasReplacementMessage = result.some(
      (msg) =>
        typeof msg.content === 'string' &&
        msg.content.includes('Previous message(s) omitted due to length'),
    )
    expect(hasReplacementMessage).toBe(true)

    // Verify total tokens are under limit
    const finalTokens = tokenCounter.countTokensJson(result)
    expect(finalTokens).toBeLessThan((maxTotalTokens - systemTokens) * 0.5)
  })

  it('does not simplify if under token limit', () => {
    const maxTotalTokens = 10_000
    const systemTokens = 100
    const result = trimMessagesToFitTokenLimit(
      testMessages,
      systemTokens,
      maxTotalTokens,
    )

    // All messages should be unchanged
    expect(result).toHaveLength(testMessages.length)
    for (let i = 0; i < testMessages.length; i++) {
      expect(result[i].role).toEqual(testMessages[i].role)
      expect(result[i].content).toEqual(testMessages[i].content)
    }

    // Verify total tokens are under limit
    const finalTokens = tokenCounter.countTokensJson(result)
    expect(finalTokens).toBeLessThan(maxTotalTokens - systemTokens)
  })

  it('handles empty messages array', () => {
    const maxTotalTokens = 200
    const systemTokens = 100
    const result = trimMessagesToFitTokenLimit([], systemTokens, maxTotalTokens)

    expect(result).toEqual([])
  })

  describe('keepDuringTruncation functionality', () => {
    it('preserves messages marked with keepDuringTruncation=true', () => {
      const messages = [
        { role: 'user', content: 'A'.repeat(500) }, // Large message to force truncation
        { role: 'user', content: 'B'.repeat(500) }, // Large message to force truncation
        {
          role: 'user',
          content: 'Message 3 - keep me!',
          keepDuringTruncation: true,
        },
        { role: 'assistant', content: 'C'.repeat(500) }, // Large message to force truncation
        {
          role: 'user',
          content: 'Message 5 - keep me too!',
          keepDuringTruncation: true,
        },
      ] as Message[]

      const result = trimMessagesToFitTokenLimit(messages, 0, 1000)

      // Should contain the kept messages
      const keptMessages = result.filter(
        (msg) =>
          typeof msg.content === 'string' &&
          (msg.content.includes('keep me!') ||
            msg.content.includes('keep me too!')),
      )
      expect(keptMessages).toHaveLength(2)

      // Should have replacement message for omitted content
      const hasReplacementMessage = result.some(
        (msg) =>
          typeof msg.content === 'string' &&
          msg.content.includes('Previous message(s) omitted due to length'),
      )
      expect(hasReplacementMessage).toBe(true)
    })

    it('does not add replacement message when no messages are removed', () => {
      const messages = [
        { role: 'user', content: 'Short message 1' },
        {
          role: 'user',
          content: 'Short message 2',
          keepDuringTruncation: true,
        },
      ] as Message[]

      const result = trimMessagesToFitTokenLimit(messages, 0, 10000)

      // Should be unchanged when under token limit
      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('Short message 1')
      expect(result[1].content).toBe('Short message 2')
    })

    it('handles consecutive replacement messages correctly', () => {
      const messages = [
        { role: 'user', content: 'A'.repeat(1000) }, // Large message to be removed
        { role: 'user', content: 'B'.repeat(1000) }, // Large message to be removed
        { role: 'user', content: 'C'.repeat(1000) }, // Large message to be removed
        { role: 'user', content: 'Keep this', keepDuringTruncation: true },
      ] as Message[]

      const result = trimMessagesToFitTokenLimit(messages, 0, 1000)

      // Should only have one replacement message for consecutive removals
      const replacementMessages = result.filter(
        (msg) =>
          typeof msg.content === 'string' &&
          msg.content.includes('Previous message(s) omitted due to length'),
      )
      expect(replacementMessages).toHaveLength(1)

      // Should keep the marked message
      const keptMessage = result.find(
        (msg) =>
          typeof msg.content === 'string' && msg.content.includes('Keep this'),
      )
      expect(keptMessage).toBeDefined()
    })

    it('calculates token removal correctly with keepDuringTruncation', () => {
      const messages = [
        { role: 'user', content: 'A'.repeat(500) }, // Will be removed
        { role: 'user', content: 'B'.repeat(500) }, // Will be removed
        {
          role: 'user',
          content: 'Keep this short message',
          keepDuringTruncation: true,
        },
        { role: 'user', content: 'C'.repeat(100) }, // Might be kept
      ] as Message[]

      const result = trimMessagesToFitTokenLimit(messages, 0, 2000)

      // Should preserve the keepDuringTruncation message
      const keptMessage = result.find(
        (msg) =>
          typeof msg.content === 'string' &&
          msg.content.includes('Keep this short message'),
      )
      expect(keptMessage).toBeDefined()

      // Total tokens should be under limit
      const finalTokens = tokenCounter.countTokensJson(result)
      expect(finalTokens).toBeLessThan(2000)
    })

    it('handles mixed keepDuringTruncation and regular messages', () => {
      const messages = [
        { role: 'user', content: 'A'.repeat(800) }, // Large message to force truncation
        { role: 'user', content: 'Keep 1', keepDuringTruncation: true },
        { role: 'user', content: 'B'.repeat(800) }, // Large message to force truncation
        { role: 'user', content: 'Keep 2', keepDuringTruncation: true },
        { role: 'user', content: 'C'.repeat(800) }, // Large message to force truncation
      ] as Message[]

      const result = trimMessagesToFitTokenLimit(messages, 0, 500)

      // Should keep both marked messages
      const keptMessages = result.filter(
        (msg) =>
          typeof msg.content === 'string' &&
          (msg.content.includes('Keep 1') || msg.content.includes('Keep 2')),
      )
      expect(keptMessages).toHaveLength(2)

      // Should have replacement messages for removed content
      const replacementMessages = result.filter(
        (msg) =>
          typeof msg.content === 'string' &&
          msg.content.includes('Previous message(s) omitted due to length'),
      )
      expect(replacementMessages.length).toBeGreaterThan(0)
    })
  })
})
