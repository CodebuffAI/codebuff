import { describe, expect, test } from 'bun:test'

import { foldAgentEvent, type AgentEventLike, type Part } from '../../core/parts'
import {
  buildFreebuffMcpTools,
  claudeCodeEnv,
  consumeClaudeStream,
  FREEBUFF_MCP_TOOL_NAMES,
} from './claude-code-harness'
import type { HarnessCallbacks } from './harness'
import type { ThreadToolDeps } from './thread-agent'

/** Build callbacks that fold into ordered parts exactly like the engine does. */
function recorder() {
  let parts: Part[] = []
  let seq = 0
  const id = () => `p${++seq}`
  const events: AgentEventLike[] = []
  const fold = (ev: AgentEventLike) => {
    events.push(ev)
    parts = foldAgentEvent(parts, ev, id)
  }
  const cb: HarnessCallbacks = {
    onText: (t) => fold({ type: 'text', text: t }),
    onReasoning: (t) => fold({ type: 'reasoning_delta', text: t }),
    onEvent: (ev) => fold(ev),
    drainSteering: () => [],
  }
  return { cb, get parts() { return parts }, events }
}

async function* gen(msgs: any[]) {
  for (const m of msgs) yield m
}

// Stream-event helpers mirroring the SDK's `{type:'stream_event', event}` envelope.
const sysInit = (session_id: string) => ({ type: 'system', subtype: 'init', session_id })
const textDelta = (text: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
})
const thinkDelta = (thinking: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking } },
})
const toolStart = (id: string, name: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_start', content_block: { type: 'tool_use', id, name } },
})
const toolInput = (partial_json: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json } },
})
const blockStop = () => ({ type: 'stream_event', event: { type: 'content_block_stop' } })
const result = (subtype: string, total_cost_usd: number, session_id: string) => ({
  type: 'result',
  subtype,
  total_cost_usd,
  session_id,
})

describe('consumeClaudeStream', () => {
  test('maps text, thinking, and a tool call in stream order; returns session + cost', async () => {
    const rec = recorder()
    const state = await consumeClaudeStream(
      gen([
        sysInit('sess-1'),
        thinkDelta('let me think'),
        textDelta('Hello '),
        textDelta('world'),
        toolStart('t1', 'Edit'),
        toolInput('{"file_path":"a.ts",'),
        toolInput('"old_string":"x"}'),
        blockStop(),
        textDelta('done'),
        result('success', 0.0123, 'sess-1'),
      ]),
      rec.cb,
    )

    expect(state.sessionId).toBe('sess-1')

    // Ordered parts: reasoning → text → tool → text (interleaved correctly).
    const kinds = rec.parts.map((p) => p.kind)
    expect(kinds).toEqual(['reasoning', 'text', 'tool', 'text'])

    const reasoning = rec.parts[0] as Extract<Part, { kind: 'reasoning' }>
    expect(reasoning.text).toBe('let me think')
    const firstText = rec.parts[1] as Extract<Part, { kind: 'text' }>
    expect(firstText.text).toBe('Hello world')
    const tool = rec.parts[2] as Extract<Part, { kind: 'tool' }>
    expect(tool.toolName).toBe('Edit')
    expect(tool.id).toBe('t1')
    expect(tool.input).toEqual({ file_path: 'a.ts', old_string: 'x' })
    const lastText = rec.parts[3] as Extract<Part, { kind: 'text' }>
    expect(lastText.text).toBe('done')

    // A finish event carrying the cost is always emitted last.
    const finish = rec.events.at(-1)!
    expect(finish.type).toBe('finish')
    expect(finish.totalCost).toBe(0.0123)
  })

  test('resume: keeps the prior session id when no init arrives', async () => {
    const rec = recorder()
    const state = await consumeClaudeStream(
      gen([textDelta('hi'), result('success', 0, 'sess-2')]),
      rec.cb,
      'sess-2',
    )
    expect(state.sessionId).toBe('sess-2')
  })

  test('non-success result surfaces a visible note', async () => {
    const rec = recorder()
    await consumeClaudeStream(gen([result('error_max_turns', 0, 's')]), rec.cb)
    const text = rec.parts.find((p) => p.kind === 'text') as Extract<Part, { kind: 'text' }>
    expect(text.text).toContain('error_max_turns')
  })

  test('malformed tool JSON is captured as _raw instead of throwing', async () => {
    const rec = recorder()
    await consumeClaudeStream(
      gen([
        toolStart('t9', 'Bash'),
        toolInput('{ not json'),
        blockStop(),
        result('success', 0, 's'),
      ]),
      rec.cb,
    )
    const tool = rec.parts.find((p) => p.kind === 'tool') as Extract<Part, { kind: 'tool' }>
    expect(tool.toolName).toBe('Bash')
    expect(tool.input).toEqual({ _raw: '{ not json' })
  })
})

describe('claudeCodeEnv', () => {
  // The harness reuses the user's local subscription/OAuth auth, which the CLI only
  // honors when no API key is present. The desktop process inherits a dummy
  // ANTHROPIC_API_KEY from .env, so the env handed to the CLI must drop it.
  test('strips ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN but keeps the rest', () => {
    const saved = {
      key: process.env.ANTHROPIC_API_KEY,
      token: process.env.ANTHROPIC_AUTH_TOKEN,
      path: process.env.PATH,
    }
    try {
      process.env.ANTHROPIC_API_KEY = 'dummy_anthropic_key'
      process.env.ANTHROPIC_AUTH_TOKEN = 'dummy_token'

      const env = claudeCodeEnv()
      expect('ANTHROPIC_API_KEY' in env).toBe(false)
      expect('ANTHROPIC_AUTH_TOKEN' in env).toBe(false)
      // Inherited vars the CLI needs (PATH/HOME/etc.) are preserved.
      expect(env.PATH).toBe(process.env.PATH)
    } finally {
      process.env.ANTHROPIC_API_KEY = saved.key
      process.env.ANTHROPIC_AUTH_TOKEN = saved.token
      process.env.PATH = saved.path
    }
  })
})

describe('freebuff in-process MCP tools', () => {
  /** Spy deps capturing what each engine callback received. */
  function fakeDeps() {
    const calls = {
      suggested: [] as { prompt: string; label?: string }[],
      docs: [] as { name: string; content: string; mode: string }[],
      browserChecks: 0,
    }
    const deps: ThreadToolDeps = {
      onSuggest: (items) => calls.suggested.push(...items),
      onWriteDoc: (name, content, mode) => {
        calls.docs.push({ name, content, mode })
        // Reject overly long writes to exercise the cap path.
        return content.length > 100 ? { ok: false, error: 'too long' } : { ok: true }
      },
      onBrowserCheck: async () => {
        calls.browserChecks++
        return {
          loaded: true,
          rendered: true,
          title: 'ok',
          renderDetail: 'canvas',
          consoleErrors: [],
          pageErrors: [],
        }
      },
    }
    const byName = new Map(
      buildFreebuffMcpTools(deps).map((t) => [`mcp__freebuff__${t.name}`, t]),
    )
    return { deps, calls, byName }
  }

  test('exposes the three tools under the mcp__freebuff__ prefix', () => {
    expect(FREEBUFF_MCP_TOOL_NAMES).toEqual([
      'mcp__freebuff__suggest_prompts',
      'mcp__freebuff__write_doc',
      'mcp__freebuff__browser_check',
    ])
  })

  // A fake stream emits an mcp tool_use; the engine surfaces it as a tool_call, and
  // the SDK transport would invoke the matching in-process tool — which fires the dep.
  test('an mcp suggest_prompts tool_use routes to the tool and fires onSuggest', async () => {
    const { calls, byName } = fakeDeps()

    let toolCall: AgentEventLike | undefined
    const rec = recorder()
    const cb: HarnessCallbacks = {
      ...rec.cb,
      onEvent: (ev) => {
        if (ev.type === 'tool_call') toolCall = ev
        rec.cb.onEvent(ev)
      },
    }

    await consumeClaudeStream(
      gen([
        toolStart('m1', 'mcp__freebuff__suggest_prompts'),
        toolInput('{"prompts":[{"prompt":"Add tests","label":"Test"}'),
        toolInput(',{"prompt":"   "}]}'),
        blockStop(),
        result('success', 0, 's'),
      ]),
      cb,
    )

    // The mcp tool_use surfaces with its fully-qualified name.
    expect(toolCall?.toolName).toBe('mcp__freebuff__suggest_prompts')

    // Invoke the in-process tool the SDK would have called for that tool_use.
    const t = byName.get(toolCall!.toolName!)!
    const out = await t.handler(toolCall!.input as any, {})

    // Blank prompt filtered; the dep callback fired with the real one.
    expect(calls.suggested).toEqual([{ prompt: 'Add tests', label: 'Test' }])
    expect(JSON.parse((out.content[0] as { text: string }).text)).toEqual({
      ok: true,
      added: 1,
    })
  })

  test('write_doc forwards to onWriteDoc and surfaces the cap error', async () => {
    const { calls, byName } = fakeDeps()
    const t = byName.get('mcp__freebuff__write_doc')!

    const ok = await t.handler({ name: 'learning', content: 'short note' } as any, {})
    expect(calls.docs).toEqual([{ name: 'learning', content: 'short note', mode: 'append' }])
    expect(JSON.parse((ok.content[0] as { text: string }).text)).toEqual({ ok: true })

    const capped = await t.handler(
      { name: 'technical', content: 'x'.repeat(200), mode: 'replace' } as any,
      {},
    )
    expect(JSON.parse((capped.content[0] as { text: string }).text)).toEqual({
      error: 'cap',
      message: 'too long',
    })
  })

  test('browser_check forwards to onBrowserCheck and returns its result', async () => {
    const { calls, byName } = fakeDeps()
    const t = byName.get('mcp__freebuff__browser_check')!

    const out = await t.handler({} as any, {})
    expect(calls.browserChecks).toBe(1)
    expect(JSON.parse((out.content[0] as { text: string }).text)).toMatchObject({
      loaded: true,
      rendered: true,
    })
  })
})
