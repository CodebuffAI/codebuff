import { describe, expect, it } from 'bun:test'

import { normalizeToolSchemas } from '../tool-schema'

import type { ChatCompletionRequestBody } from '../types'

describe('normalizeToolSchemas', () => {
  it('inlines local tool schema references before provider routing', () => {
    const body: ChatCompletionRequestBody = {
      model: 'minimax/minimax-m2.7',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'ask_user',
            parameters: {
              type: 'object',
              properties: {
                questions: {
                  type: 'array',
                  items: { $ref: '#/definitions/__schema0' },
                },
              },
              definitions: {
                __schema0: {
                  type: 'object',
                  properties: {
                    question: { type: 'string' },
                  },
                  required: ['question'],
                },
              },
            },
          },
        },
      ],
    }

    const normalized = normalizeToolSchemas(body)
    const parameters = normalized.tools?.[0]?.function?.parameters

    expect(parameters).toEqual({
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
            },
            required: ['question'],
          },
        },
      },
    })
    expect(JSON.stringify(parameters)).not.toContain('#/definitions/__schema0')
    expect(JSON.stringify(parameters)).not.toContain('definitions')
  })
})
