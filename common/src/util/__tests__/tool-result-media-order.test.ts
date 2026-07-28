import { describe, expect, it } from 'bun:test'

import { convertCbToModelMessages } from '../messages'

import type { Message } from '../../types/messages/codebuff-message'

/**
 * preview_screenshot returns [media, json] so the model sees the pixels before
 * the note. A `media` part becomes a user message (providers reject images
 * inside a tool message), so emitting parts in their original order put that
 * user message between the assistant's tool_call and its result — which
 * providers reject, and which the server's repair then resolves by dropping
 * both the call and the result.
 */
describe('convertMessages — tool results carrying media', () => {
  const screenshotHistory = (): Message[] => [
    { role: 'user', content: [{ type: 'text', text: 'take a screenshot' }] },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'shot-1',
          toolName: 'preview_screenshot',
          input: {},
        },
      ],
    },
    {
      role: 'tool',
      toolName: 'preview_screenshot',
      toolCallId: 'shot-1',
      content: [
        { type: 'media', data: 'BASE64PNG', mediaType: 'image/png' },
        { type: 'json', value: { ok: true } },
      ],
    },
  ]

  it('puts the tool result immediately after the call, image after', () => {
    const converted = convertCbToModelMessages({
      messages: screenshotHistory(),
    })

    expect(converted.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ])
  })

  it('keeps both the result and the image', () => {
    const converted = convertCbToModelMessages({
      messages: screenshotHistory(),
    })
    const serialized = JSON.stringify(converted)

    expect(serialized).toContain('BASE64PNG')
    expect(serialized).toContain('shot-1')
  })

  it('is unaffected when a tool returns json only', () => {
    const converted = convertCbToModelMessages({
      messages: [
        {
          role: 'tool',
          toolName: 'read_files',
          toolCallId: 'r1',
          content: [{ type: 'json', value: { files: [] } }],
        },
      ] as Message[],
    })

    expect(converted.map((m) => m.role)).toEqual(['tool'])
  })
})

describe('convertMessages — tool results with media but no json', () => {
  it('still answers the call, so it is not left unpaired', () => {
    // `mediaToolResult` produces media-only output. Emitting just the user
    // message would leave the assistant's tool_call permanently unanswered.
    const converted = convertCbToModelMessages({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'shot-2',
              toolName: 'preview_screenshot',
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'preview_screenshot',
          toolCallId: 'shot-2',
          content: [{ type: 'media', data: 'ONLYIMG', mediaType: 'image/png' }],
        },
      ] as Message[],
    })

    expect(converted.map((m) => m.role)).toEqual(['assistant', 'tool', 'user'])
    expect(JSON.stringify(converted)).toContain('ONLYIMG')
  })
})
