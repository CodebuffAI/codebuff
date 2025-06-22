import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import { Message } from '@codebuff/common/types/message'

import {
  trimMessagesToFitTokenLimit,
  getMessageText,
  messagesWithSystem,
} from '../messages'
import * as tokenCounter from '../token-counter'

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

describe('getMessageText', () => {
  it('returns string content directly', () => {
    const message = { role: 'user', content: 'hello' } as Message
    expect(getMessageText(message)).toBe('hello')
  })

  it('combines text content from array', () => {
    const message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' },
      ],
    } as Message
    expect(getMessageText(message)).toBe('hello\nworld')
  })

  it('skips non-text content', () => {
    const message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'hello' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: 'xyz' },
        },
        { type: 'text', text: 'world' },
      ],
    } as Message
    expect(getMessageText(message)).toBe('hello\n\nworld')
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
      maxTotalTokens
    )

    // Verify the first message was dropped
    expect(result).toHaveLength(testMessages.length - 1)

    // Regular messages should be unchanged
    expect(result[0].content).toBe(testMessages[1].content)
    expect(result[6].content).toEqual(testMessages[7].content)

    // 0th and second terminal outputs should be simplified
    expect(result[1].role).toEqual(testMessages[2].role)
    expect(Array.isArray(result[1].content)).toBe(true)
    expect((result[1].content[0] as any).text).toContain(
      '<result>[Output omitted]</result>'
    )
    expect((result[1].content[1] as any).text).toBe(
      (testMessages[2].content[1] as any).text
    )

    expect(result[2].role).toEqual(testMessages[3].role)
    expect(result[2].content).toContain('<result>[Output omitted]</result>')

    // Terminal outputs 3-7 should be preserved exactly
    expect(result[3].content).toBe(testMessages[4].content)
    expect(result[4].content).toEqual(testMessages[5].content)
    expect(result[5].content).toBe(testMessages[6].content)
    expect(result[6].content).toBe(testMessages[7].content)

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
      maxTotalTokens
    )

    // Verify the first message was dropped
    expect(result).toHaveLength(testMessages.length - 1)

    // Regular messages should be unchanged
    expect(result[0].content).toBe(testMessages[1].content)
    expect(result[6].content).toEqual(testMessages[7].content)

    // 0th and second terminal outputs should be simplified
    expect(result[1].role).toEqual(testMessages[2].role)
    expect(Array.isArray(result[1].content)).toBe(true)
    expect((result[1].content[0] as any).text).toContain(
      '<result>[Output omitted]</result>'
    )
    expect((result[1].content[1] as any).text).toBe(
      (testMessages[2].content[1] as any).text
    )

    expect(result[2].role).toEqual(testMessages[3].role)
    expect(result[2].content).toContain('<result>[Output omitted]</result>')

    // Terminal outputs 3-7 should be preserved exactly
    expect(result[3].content).toBe(testMessages[4].content)
    expect(result[4].content).toEqual(testMessages[5].content)
    expect(result[5].content).toBe(testMessages[6].content)
    expect(result[6].content).toBe(testMessages[7].content)

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
      maxTotalTokens
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
})
