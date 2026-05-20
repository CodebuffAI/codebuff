import { describe, expect, it } from 'bun:test'

import { buildMoonshotRequestBody } from '../moonshot'

import type { ChatCompletionRequestBody } from '../types'

type MoonshotRequestBody = Omit<ChatCompletionRequestBody, 'messages'> & {
  messages: Array<
    ChatCompletionRequestBody['messages'][number] & {
      reasoning_content?: string | null
    }
  >
}

function buildBody(body: MoonshotRequestBody) {
  return buildMoonshotRequestBody(
    body as ChatCompletionRequestBody,
    'moonshotai/kimi-k2.6',
  )
}

describe('buildMoonshotRequestBody', () => {
  it('enables preserved thinking by default for Kimi K2.6', () => {
    const body = buildBody({
      model: 'moonshotai/kimi-k2.6',
      messages: [
        {
          role: 'assistant',
          content: 'I will inspect the files.',
          reasoning_content: 'Need to understand the repo first.',
        },
        {
          role: 'user',
          content: 'Continue.',
        },
      ],
    })

    expect(body.model).toBe('kimi-k2.6')
    expect(body.thinking).toEqual({ type: 'enabled', keep: 'all' })
    expect(body.messages).toEqual([
      {
        role: 'assistant',
        content: 'I will inspect the files.',
        reasoning_content: 'Need to understand the repo first.',
      },
      {
        role: 'user',
        content: 'Continue.',
      },
    ])
  })

  it('keeps historical reasoning when thinking is explicitly enabled', () => {
    const body = buildBody({
      model: 'moonshotai/kimi-k2.6',
      messages: [{ role: 'user', content: 'hello' }],
      reasoning: { enabled: true },
    })

    expect(body.thinking).toEqual({ type: 'enabled', keep: 'all' })
    expect(body.reasoning).toBeUndefined()
  })

  it('does not preserve thinking when reasoning is explicitly disabled', () => {
    const body = buildBody({
      model: 'moonshotai/kimi-k2.6',
      messages: [
        {
          role: 'assistant',
          content: 'Done.',
          reasoning_content: 'Used the tool result.',
        },
        { role: 'user', content: 'next' },
      ],
      reasoning: { enabled: false },
    })

    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.reasoning).toBeUndefined()
  })
})
