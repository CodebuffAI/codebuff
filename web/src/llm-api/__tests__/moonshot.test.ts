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

function buildBody(body: MoonshotRequestBody, model = 'moonshotai/kimi-k2.6') {
  return buildMoonshotRequestBody(body as ChatCompletionRequestBody, model)
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

  it('defaults max_tokens for kimi-k2.7-code when the request omits it', () => {
    const body = buildBody(
      {
        model: 'moonshotai/kimi-k2.7-code',
        messages: [{ role: 'user', content: 'hello' }],
      },
      'moonshotai/kimi-k2.7-code',
    )

    expect(body.model).toBe('kimi-k2.7-code')
    expect(body.max_tokens).toBe(32768)
  })

  it('respects an explicit max_tokens for kimi-k2.7-code', () => {
    const body = buildBody(
      {
        model: 'moonshotai/kimi-k2.7-code',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 2048,
      },
      'moonshotai/kimi-k2.7-code',
    )

    expect(body.max_tokens).toBe(2048)
  })

  it('does not add a max_tokens default for kimi-k2.6', () => {
    const body = buildBody({
      model: 'moonshotai/kimi-k2.6',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(body.max_tokens).toBeUndefined()
  })
})
