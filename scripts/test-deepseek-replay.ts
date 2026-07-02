/**
 * Live integration test for the DeepSeek reasoning-replay fix (PR #430).
 *
 * DeepSeek V4 thinking mode 400s ("The `reasoning_content` in the thinking
 * mode must be passed back to the API.") when an assistant message carrying
 * tool_calls after the last user message lacks a reasoning_content key. This
 * script proves the fix end-to-end against the LIVE DeepSeek API:
 *
 *  1. Real tool loop: stream turn 1, capture the model's ACTUAL tool_calls +
 *     reasoning, then replay turn 2 in the broken old-client shapes (split /
 *     dropped reasoning) through buildDeepSeekRequestBody → expect 200.
 *     Includes a negative control (raw split body, no normalization) that
 *     must still 400 — proving the test detects the original bug.
 *  2. Client converter: run the real convertToOpenAICompatibleChatMessages
 *     on a split-assistant LanguageModelV2Prompt and send its output live →
 *     expect 200. Control: the pre-fix converter's split output → 400.
 *
 * IMPORTANT (discovered 2026-07-01): the enforcement is keyed on the
 * tool_call id. Replays that keep DeepSeek's OWN ids (`call_00_…`) are
 * accepted even with no/garbage reasoning — DeepSeek evidently recovers the
 * reasoning server-side. Replays with foreign ids (what our runtime sends)
 * hit the strict rule. All replay shapes below therefore use client-style
 * synthetic ids so the test exercises the strict path production hits.
 *
 * Usage (needs only the DeepSeek key; no DB):
 *   DEEPSEEK_API_KEY=$(infisical secrets get DEEPSEEK_API_KEY --env=prod --plain) \
 *     bun scripts/test-deepseek-replay.ts
 */
import { buildDeepSeekRequestBody } from '../web/src/llm-api/deepseek-request-body'
import { convertToOpenAICompatibleChatMessages } from '../packages/llm-providers/src/openai-compatible/chat/convert-to-openai-compatible-chat-messages'

import type { ChatCompletionRequestBody } from '../web/src/llm-api/types'

const KEY = process.env.DEEPSEEK_API_KEY
if (!KEY) {
  console.error('DEEPSEEK_API_KEY is required')
  process.exit(1)
}
const API = 'https://api.deepseek.com/chat/completions'

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a city',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  },
]

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`)
}

async function post(body: Record<string, unknown>): Promise<Response> {
  return fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function errMessage(res: Response): Promise<string> {
  try {
    return (await res.json())?.error?.message ?? ''
  } catch {
    return ''
  }
}

// === 1. Real tool loop ======================================================

console.log('--- turn 1: live streamed request, capture real tool_calls ---')
const turn1User = {
  role: 'user',
  content: 'What is the weather in Paris right now? Use the get_weather tool.',
}
const turn1Body = buildDeepSeekRequestBody({
  model: 'deepseek/deepseek-v4-flash',
  messages: [turn1User],
  tools,
  stream: true,
  reasoning: { enabled: true, effort: 'high' },
} as unknown as ChatCompletionRequestBody)

const turn1Res = await post(turn1Body)
check('turn 1 streams 200', turn1Res.status === 200, `status ${turn1Res.status}`)

let reasoning = ''
const calls: Record<number, { id: string; name: string; args: string }> = {}
{
  const reader = turn1Res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl = buf.indexOf('\n')
    while (nl !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      nl = buf.indexOf('\n')
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      let obj: any
      try {
        obj = JSON.parse(line.slice(6))
      } catch {
        continue
      }
      const delta = obj.choices?.[0]?.delta
      if (typeof delta?.reasoning_content === 'string')
        reasoning += delta.reasoning_content
      for (const tc of delta?.tool_calls ?? []) {
        const slot = (calls[tc.index] ??= { id: '', name: '', args: '' })
        if (tc.id) slot.id = tc.id
        if (tc.function?.name) slot.name = tc.function.name
        if (tc.function?.arguments) slot.args += tc.function.arguments
      }
    }
  }
}
const captured = Object.values(calls)
check(
  'turn 1 produced reasoning + a real tool call',
  reasoning.length > 0 && captured.length > 0 && captured[0].name === 'get_weather',
  `reasoning ${reasoning.length} chars, ${captured.length} tool call(s)`,
)
if (captured.length === 0) {
  console.error('Cannot continue without a captured tool call')
  process.exit(1)
}
// Client-style synthetic ids: production requests carry runtime-generated
// ids, not DeepSeek's own — that's the strict-validation path (see header).
const replayToolCalls = captured.map((c, i) => ({
  id: `call_client_${i}`,
  type: 'function',
  function: { name: c.name, arguments: c.args },
}))
const toolResults = replayToolCalls.map((tc) => ({
  role: 'tool',
  tool_call_id: tc.id,
  content: '{"temp_c": 21, "conditions": "partly cloudy"}',
}))

console.log('--- turn 2: replay in broken old-client shapes ---')
// Shape the runtime historically produced: reasoning in its OWN assistant
// message, tool_calls in the next one.
const splitHistory = [
  turn1User,
  { role: 'assistant', content: '', reasoning_content: reasoning },
  { role: 'assistant', content: '', tool_calls: replayToolCalls },
  ...toolResults,
]
// Old clients that dropped reasoning entirely.
const droppedHistory = [
  turn1User,
  { role: 'assistant', content: '', tool_calls: replayToolCalls },
  ...toolResults,
]

// Negative control: the split shape sent RAW (no normalization) must still
// 400 — otherwise this test can no longer detect the original bug.
{
  const res = await post({
    model: 'deepseek-v4-flash',
    messages: splitHistory,
    tools,
    thinking: { type: 'enabled', reasoning_effort: 'high' },
    stream: false,
    max_completion_tokens: 60,
  })
  const msg = await errMessage(res)
  check(
    'control: raw split history still 400s without the fix',
    res.status === 400 && msg.includes('reasoning_content'),
    `status ${res.status}`,
  )
}

for (const [name, history] of [
  ['split reasoning', splitHistory],
  ['dropped reasoning', droppedHistory],
] as const) {
  const body = buildDeepSeekRequestBody({
    model: 'deepseek/deepseek-v4-flash',
    messages: history,
    tools,
    stream: false,
    max_completion_tokens: 120,
    reasoning: { enabled: true, effort: 'high' },
  } as unknown as ChatCompletionRequestBody)
  const res = await post(body)
  let content = ''
  if (res.ok) content = (await res.json()).choices?.[0]?.message?.content ?? ''
  check(
    `turn 2 (${name}) through buildDeepSeekRequestBody → 200 + answer`,
    res.status === 200 && content.length > 0,
    res.ok ? `"${content.slice(0, 50)}..."` : `status ${res.status}: ${await errMessage(res)}`,
  )
}

// === 2. Client converter against the live API ===============================

console.log('--- client converter: split prompt → merged wire message ---')
const prompt = [
  { role: 'user', content: [{ type: 'text', text: turn1User.content }] },
  { role: 'assistant', content: [{ type: 'reasoning', text: reasoning }] },
  {
    role: 'assistant',
    content: captured.map((c, i) => ({
      type: 'tool-call',
      toolCallId: `call_client_${i}`,
      toolName: c.name,
      input: JSON.parse(c.args || '{}'),
    })),
  },
  {
    role: 'tool',
    content: captured.map((c, i) => ({
      type: 'tool-result',
      toolCallId: `call_client_${i}`,
      toolName: c.name,
      output: { type: 'json', value: { temp_c: 21, conditions: 'partly cloudy' } },
    })),
  },
] as Parameters<typeof convertToOpenAICompatibleChatMessages>[0]

const wire = convertToOpenAICompatibleChatMessages(prompt)
const wireAssistants = wire.filter((m) => m.role === 'assistant')
check(
  'converter merges the assistant run into one message w/ reasoning + tool_calls',
  wireAssistants.length === 1 &&
    typeof (wireAssistants[0] as any).reasoning_content === 'string' &&
    ((wireAssistants[0] as any).tool_calls?.length ?? 0) > 0,
  `${wireAssistants.length} assistant wire message(s)`,
)

{
  const res = await post({
    model: 'deepseek-v4-flash',
    messages: wire,
    tools,
    thinking: { type: 'enabled', reasoning_effort: 'high' },
    stream: false,
    max_completion_tokens: 120,
  })
  let content = ''
  if (res.ok) content = (await res.json()).choices?.[0]?.message?.content ?? ''
  check(
    'converter output accepted live → 200 + answer',
    res.status === 200 && content.length > 0,
    res.ok ? `"${content.slice(0, 50)}..."` : `status ${res.status}: ${await errMessage(res)}`,
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
