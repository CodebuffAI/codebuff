import { describe, expect, it } from 'bun:test'

import { addKimiToolCompatibilityFields, isKimiModel } from '../kimi-tool-compat'

import type { ChatCompletionRequestBody } from '../types'

describe('addKimiToolCompatibilityFields', () => {
  it('adds declaration ids and tool-result names without mutating input', () => {
    const body: ChatCompletionRequestBody = {
      model: 'moonshotai/kimi-k2.6',
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_123',
              type: 'function',
              function: {
                name: 'read_files',
                arguments: JSON.stringify({ paths: ['README.md'] }),
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_123',
          content: JSON.stringify({ message: 'ok' }),
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'read_files',
            description: 'Read files',
            parameters: { type: 'object' },
          },
        },
      ],
    }

    const result = addKimiToolCompatibilityFields(body)

    expect(result.tools?.[0]).toEqual({
      id: 'tool_1',
      type: 'function',
      function: {
        name: 'read_files',
        description: 'Read files',
        parameters: { type: 'object' },
      },
    })
    expect(result.messages[1]).toEqual({
      role: 'tool',
      tool_call_id: 'call_123',
      name: 'read_files',
      content: JSON.stringify({ message: 'ok' }),
    })
    expect(body.tools?.[0]).not.toHaveProperty('id')
    expect(body.messages[1]).not.toHaveProperty('name')
  })

  it('preserves existing ids and names', () => {
    const body: ChatCompletionRequestBody = {
      model: 'moonshotai/kimi-k2.6',
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_456',
              type: 'function',
              function: {
                name: 'write_todos',
                arguments: JSON.stringify({ todos: [] }),
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_456',
          name: 'existing_name',
          content: '{}',
        },
      ],
      tools: [
        {
          id: 'existing_tool_id',
          type: 'function',
          function: {
            name: 'write_todos',
            parameters: { type: 'object' },
          },
        },
      ],
    }

    expect(addKimiToolCompatibilityFields(body)).toEqual(body)
  })
})

describe('isKimiModel', () => {
  it('matches only Moonshot model ids', () => {
    expect(isKimiModel('moonshotai/kimi-k2.6')).toBe(true)
    expect(isKimiModel('anthropic/claude-sonnet-4.5')).toBe(false)
    expect(isKimiModel(undefined)).toBe(false)
  })
})
