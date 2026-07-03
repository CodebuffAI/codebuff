import { describe, expect, it } from 'bun:test'

import {
  buildDeepSeekRequestBody,
  normalizeDeepSeekAssistantReasoning,
} from '../deepseek-request-body'

import type { ChatCompletionRequestBody } from '../types'

type Messages = ChatCompletionRequestBody['messages']

const toolCall = (id: string) => ({
  id,
  type: 'function' as const,
  function: { name: 'read_files', arguments: '{"paths":["a.ts"]}' },
})

describe('normalizeDeepSeekAssistantReasoning', () => {
  it('merges a split reasoning message into the adjacent tool-call message', () => {
    const messages = [
      { role: 'user', content: 'Read a.ts' },
      { role: 'assistant', content: '', reasoning_content: 'I should read the file.' },
      { role: 'assistant', content: '', tool_calls: [toolCall('call_1')] },
      { role: 'tool', tool_call_id: 'call_1', content: '{}' },
    ] as Messages

    const normalized = normalizeDeepSeekAssistantReasoning(messages)

    expect(normalized).toEqual([
      { role: 'user', content: 'Read a.ts' },
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'I should read the file.',
        tool_calls: [toolCall('call_1')],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{}' },
    ] as Messages)
    // Input untouched (fresh clones).
    expect(messages).toHaveLength(4)
    expect(messages[2].tool_calls).toEqual([toolCall('call_1')])
  })

  it('concatenates content, reasoning, and tool_calls across a run of assistant messages', () => {
    const messages = [
      { role: 'user', content: 'Go' },
      { role: 'assistant', content: '', reasoning_content: 'First, ' },
      { role: 'assistant', content: 'Working on it.', reasoning_content: 'read both files.' },
      { role: 'assistant', content: ' Done planning.', tool_calls: [toolCall('call_1')] },
      { role: 'assistant', content: '', tool_calls: [toolCall('call_2')] },
      { role: 'tool', tool_call_id: 'call_1', content: '{}' },
      { role: 'tool', tool_call_id: 'call_2', content: '{}' },
    ] as Messages

    const normalized = normalizeDeepSeekAssistantReasoning(messages)

    expect(normalized).toEqual([
      { role: 'user', content: 'Go' },
      {
        role: 'assistant',
        content: 'Working on it. Done planning.',
        reasoning_content: 'First, read both files.',
        tool_calls: [toolCall('call_1'), toolCall('call_2')],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{}' },
      { role: 'tool', tool_call_id: 'call_2', content: '{}' },
    ] as Messages)
  })

  it('backfills empty reasoning_content on tool-call messages after the last user message', () => {
    const messages = [
      { role: 'user', content: 'Go' },
      { role: 'assistant', content: '', tool_calls: [toolCall('call_1')] },
      { role: 'tool', tool_call_id: 'call_1', content: '{}' },
      { role: 'assistant', content: '', tool_calls: [toolCall('call_2')] },
      { role: 'tool', tool_call_id: 'call_2', content: '{}' },
    ] as Messages

    const normalized = normalizeDeepSeekAssistantReasoning(messages) as Array<
      Messages[number] & { reasoning_content?: string }
    >

    expect(normalized[1].reasoning_content).toBe('')
    expect(normalized[3].reasoning_content).toBe('')
  })

  it('leaves tool-call messages before the last user message alone', () => {
    const messages = [
      { role: 'user', content: 'Go' },
      { role: 'assistant', content: '', tool_calls: [toolCall('call_1')] },
      { role: 'tool', tool_call_id: 'call_1', content: '{}' },
      { role: 'user', content: 'Thanks, continue' },
      { role: 'assistant', content: 'Sure.' },
    ] as Messages

    const normalized = normalizeDeepSeekAssistantReasoning(messages)

    expect(normalized[1]).not.toHaveProperty('reasoning_content')
    // Text-only assistant messages never need reasoning_content.
    expect(normalized[4]).not.toHaveProperty('reasoning_content')
  })

  it('keeps extra fields from merged-away assistant messages', () => {
    const messages = [
      { role: 'user', content: 'Go' },
      { role: 'assistant', content: '', reasoning_content: 'Think.' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [toolCall('call_1')],
        name: 'buffy',
      } as unknown as Messages[number],
      { role: 'tool', tool_call_id: 'call_1', content: '{}' },
    ] as Messages

    const normalized = normalizeDeepSeekAssistantReasoning(messages)

    expect(normalized[1]).toEqual({
      role: 'assistant',
      content: '',
      reasoning_content: 'Think.',
      tool_calls: [toolCall('call_1')],
      name: 'buffy',
    } as unknown as Messages[number])
  })

  it('does not overwrite reasoning_content that is already present', () => {
    const messages = [
      { role: 'user', content: 'Go' },
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'Existing reasoning.',
        tool_calls: [toolCall('call_1')],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{}' },
    ] as Messages

    const normalized = normalizeDeepSeekAssistantReasoning(messages) as Array<
      Messages[number] & { reasoning_content?: string }
    >

    expect(normalized[1].reasoning_content).toBe('Existing reasoning.')
  })
})

describe('buildDeepSeekRequestBody tool_choice', () => {
  const baseBody = (
    overrides: Partial<ChatCompletionRequestBody>,
  ): ChatCompletionRequestBody => ({
    model: 'deepseek/deepseek-v4-flash',
    messages: [{ role: 'user', content: 'Go' }],
    ...overrides,
  })

  it('drops tool_choice when thinking is explicitly enabled', () => {
    const sentBody = buildDeepSeekRequestBody(
      baseBody({
        tool_choice: 'required',
        reasoning: { enabled: true, effort: 'high' },
      }),
    )

    expect(sentBody).not.toHaveProperty('tool_choice')
  })

  it('drops tool_choice when thinking is on by default (no reasoning field)', () => {
    const sentBody = buildDeepSeekRequestBody(
      baseBody({ tool_choice: { type: 'auto' } }),
    )

    expect(sentBody).not.toHaveProperty('tool_choice')
  })

  it('converts the object form {type: "auto"} to a string when thinking is disabled', () => {
    const sentBody = buildDeepSeekRequestBody(
      baseBody({
        tool_choice: { type: 'auto' },
        reasoning: { enabled: false },
      }),
    )

    expect(sentBody.tool_choice).toBe('auto')
  })

  it('keeps valid string and named-function forms when thinking is disabled', () => {
    const stringBody = buildDeepSeekRequestBody(
      baseBody({ tool_choice: 'none', reasoning: { enabled: false } }),
    )
    expect(stringBody.tool_choice).toBe('none')

    const namedChoice = {
      type: 'function',
      function: { name: 'read_files' },
    }
    const namedBody = buildDeepSeekRequestBody(
      baseBody({ tool_choice: namedChoice, reasoning: { enabled: false } }),
    )
    expect(namedBody.tool_choice).toEqual(namedChoice)
  })

  it('drops unrecognized tool_choice shapes when thinking is disabled', () => {
    const sentBody = buildDeepSeekRequestBody(
      baseBody({
        tool_choice: { type: 'tool', toolName: 'read_files' },
        reasoning: { enabled: false },
      }),
    )

    expect(sentBody).not.toHaveProperty('tool_choice')
  })

  it('leaves bodies without tool_choice untouched', () => {
    const sentBody = buildDeepSeekRequestBody(baseBody({}))

    expect(sentBody).not.toHaveProperty('tool_choice')
    expect(sentBody.model).toBeDefined()
  })
})

describe('buildDeepSeekRequestBody reasoning replay', () => {
  it('produces a replay-valid body from a split-reasoning history', () => {
    const body: ChatCompletionRequestBody = {
      model: 'deepseek/deepseek-v4-flash',
      messages: [
        { role: 'system', content: 'You are a coding assistant.' },
        { role: 'user', content: 'Read a.ts' },
        {
          role: 'assistant',
          content: '',
          reasoning_content: 'Read the file first.',
        } as ChatCompletionRequestBody['messages'][number],
        { role: 'assistant', content: '', tool_calls: [toolCall('call_1')] },
        { role: 'tool', tool_call_id: 'call_1', content: '{}' },
      ],
      stream: true,
    }

    const sentBody = buildDeepSeekRequestBody(body, body.model)
    const messages = sentBody.messages as Array<{
      role: string
      reasoning_content?: string
      tool_calls?: unknown[]
    }>

    expect(messages).toHaveLength(4)
    const assistant = messages[2]
    expect(assistant.role).toBe('assistant')
    expect(assistant.reasoning_content).toBe('Read the file first.')
    expect(assistant.tool_calls).toHaveLength(1)
  })
})
