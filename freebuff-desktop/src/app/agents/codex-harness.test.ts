import { describe, expect, test } from 'bun:test'

import type { ThreadEvent } from '@openai/codex-sdk'

import { foldAgentEvent, type AgentEventLike, type Part } from '../../core/parts'
import {
  codexEnv,
  CodexAuthError,
  consumeCodexStream,
  isCodexAvailable,
  resolveCodexExecutable,
  translateCodexError,
} from './codex-harness'
import type { HarnessCallbacks } from './harness'

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
  return {
    cb,
    get parts() {
      return parts
    },
    events,
  }
}

async function* gen(msgs: ThreadEvent[]) {
  for (const m of msgs) yield m
}

// Event helpers mirroring the codex-sdk ThreadEvent stream.
const threadStarted = (thread_id: string): ThreadEvent => ({ type: 'thread.started', thread_id })
const turnStarted = (): ThreadEvent => ({ type: 'turn.started' })
const turnCompleted = (): ThreadEvent => ({
  type: 'turn.completed',
  usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
})
const reasoningDone = (id: string, text: string): ThreadEvent => ({
  type: 'item.completed',
  item: { id, type: 'reasoning', text },
})
const messageDone = (id: string, text: string): ThreadEvent => ({
  type: 'item.completed',
  item: { id, type: 'agent_message', text },
})
const cmdStarted = (id: string, command: string): ThreadEvent => ({
  type: 'item.started',
  item: { id, type: 'command_execution', command, aggregated_output: '', status: 'in_progress' },
})
const cmdDone = (id: string, command: string, exit_code = 0): ThreadEvent => ({
  type: 'item.completed',
  item: { id, type: 'command_execution', command, aggregated_output: 'ok', exit_code, status: 'completed' },
})
const fileChangeDone = (id: string, path: string): ThreadEvent => ({
  type: 'item.completed',
  item: { id, type: 'file_change', changes: [{ path, kind: 'add' }], status: 'completed' },
})

describe('consumeCodexStream', () => {
  test('maps reasoning, message, and a tool call in stream order; returns thread id', async () => {
    const rec = recorder()
    const state = await consumeCodexStream(
      gen([
        threadStarted('th-1'),
        turnStarted(),
        reasoningDone('i0', 'let me think'),
        cmdStarted('i1', 'ls'),
        messageDone('i2', 'Done.'),
        turnCompleted(),
      ]),
      rec.cb,
    )

    expect(state.threadId).toBe('th-1')

    // reasoning → tool → text, in the order the items streamed.
    expect(rec.parts.map((p) => p.kind)).toEqual(['reasoning', 'tool', 'text'])
    const reasoning = rec.parts[0] as Extract<Part, { kind: 'reasoning' }>
    expect(reasoning.text).toBe('let me think')
    const tool = rec.parts[1] as Extract<Part, { kind: 'tool' }>
    expect(tool.toolName).toBe('command_execution')
    expect(tool.id).toBe('i1')
    expect(tool.input).toEqual({ command: 'ls' })
    const text = rec.parts[2] as Extract<Part, { kind: 'text' }>
    expect(text.text).toBe('Done.')

    expect(rec.events.at(-1)!.type).toBe('finish')
  })

  test('a command emits ONE tool call from item.started, not a duplicate on completed', async () => {
    const rec = recorder()
    await consumeCodexStream(gen([cmdStarted('c1', 'pwd'), cmdDone('c1', 'pwd'), turnCompleted()]), rec.cb)
    const tools = rec.parts.filter((p) => p.kind === 'tool')
    expect(tools).toHaveLength(1)
    expect((tools[0] as Extract<Part, { kind: 'tool' }>).id).toBe('c1')
  })

  test('a command with no item.started still emits its tool call on completed', async () => {
    const rec = recorder()
    await consumeCodexStream(gen([cmdDone('c9', 'echo hi'), turnCompleted()]), rec.cb)
    expect(rec.parts.filter((p) => p.kind === 'tool')).toHaveLength(1)
  })

  test('file_change surfaces as a tool call carrying its changed paths', async () => {
    const rec = recorder()
    await consumeCodexStream(gen([fileChangeDone('f1', 'src/a.ts'), turnCompleted()]), rec.cb)
    const tool = rec.parts.find((p) => p.kind === 'tool') as Extract<Part, { kind: 'tool' }>
    expect(tool.toolName).toBe('file_change')
    expect(tool.input).toEqual({ changes: [{ path: 'src/a.ts', kind: 'add' }] })
  })

  test('resume: keeps the prior thread id when no thread.started arrives', async () => {
    const rec = recorder()
    const state = await consumeCodexStream(gen([messageDone('m', 'hi'), turnCompleted()]), rec.cb, 'th-2')
    expect(state.threadId).toBe('th-2')
  })

  test('an item-level error is a non-fatal note, not a turn failure', async () => {
    const rec = recorder()
    const state = await consumeCodexStream(
      gen([
        { type: 'item.completed', item: { id: 'e1', type: 'error', message: 'output truncated' } },
        messageDone('m', 'carried on'),
        turnCompleted(),
      ]),
      rec.cb,
    )
    expect(state.threadId).toBeUndefined()
    const texts = rec.parts.filter((p) => p.kind === 'text') as Extract<Part, { kind: 'text' }>[]
    expect(texts.some((t) => t.text.includes('output truncated'))).toBe(true)
    expect(rec.events.at(-1)!.type).toBe('finish')
  })

  test('turn.failed with an auth message throws CodexAuthError', async () => {
    const rec = recorder()
    await expect(
      consumeCodexStream(
        gen([threadStarted('t'), { type: 'turn.failed', error: { message: 'Please run codex login' } }]),
        rec.cb,
      ),
    ).rejects.toBeInstanceOf(CodexAuthError)
  })

  test('a top-level error throws a plain Error carrying its message', async () => {
    const rec = recorder()
    await expect(
      consumeCodexStream(
        gen([{ type: 'error', message: "The 'gpt-5.5-codex' model is not supported" }]),
        rec.cb,
      ),
    ).rejects.toThrow(/not supported/)
  })

  // A fatal error is usually followed by the exec throwing an uninformative
  // "exited with code 1" — we must raise the IN-BAND reason, not that.
  test('prefers the in-band fatal reason over a subsequent stream throw', async () => {
    async function* boom(): AsyncGenerator<ThreadEvent> {
      yield { type: 'error', message: 'quota exceeded' }
      throw new Error('Codex Exec exited with code 1')
    }
    const rec = recorder()
    await expect(consumeCodexStream(boom(), rec.cb)).rejects.toThrow(/quota exceeded/)
  })
})

describe('translateCodexError', () => {
  test.each([
    'not logged in',
    'Please run `codex login`',
    'ChatGPT token has expired',
    'request failed with status 401 unauthorized',
  ])('maps %s to CodexAuthError', (raw) => {
    const out = translateCodexError(new Error(raw))
    expect(out).toBeInstanceOf(CodexAuthError)
    const auth = out as CodexAuthError
    expect(auth.message).toContain('codex login')
    expect(auth.message).toContain('Freebuff agent')
    expect(auth.causeMessage).toBe(raw)
  })

  test('maps a missing-CLI error to an install message', () => {
    const out = translateCodexError(
      new Error('Unable to locate Codex CLI binaries for aarch64-apple-darwin'),
    ) as Error
    expect(out).toBeInstanceOf(Error)
    expect(out).not.toBeInstanceOf(CodexAuthError)
    expect(out.message).toContain('Codex CLI not found')
  })

  test('passes non-auth errors through unchanged and is idempotent', () => {
    const err = new Error('some unrelated failure')
    expect(translateCodexError(err)).toBe(err)
    const auth = translateCodexError(new Error('not logged in'))
    expect(translateCodexError(auth)).toBe(auth)
  })
})

describe('codexEnv', () => {
  // The harness reuses the user's ChatGPT/OpenAI login, which the CLI only honors
  // when no API key overrides it — so the env handed to the CLI must drop them.
  test('strips OPENAI_API_KEY / CODEX_API_KEY but keeps the rest', () => {
    const saved = {
      openai: process.env.OPENAI_API_KEY,
      codex: process.env.CODEX_API_KEY,
    }
    try {
      process.env.OPENAI_API_KEY = 'sk-dummy'
      process.env.CODEX_API_KEY = 'ck-dummy'
      const env = codexEnv()
      expect('OPENAI_API_KEY' in env).toBe(false)
      expect('CODEX_API_KEY' in env).toBe(false)
      expect(env.PATH).toBe(process.env.PATH ?? '')
    } finally {
      if (saved.openai === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = saved.openai
      if (saved.codex === undefined) delete process.env.CODEX_API_KEY
      else process.env.CODEX_API_KEY = saved.codex
    }
  })
})

describe('resolveCodexExecutable', () => {
  const orig = process.env.FREEBUFF_CODEX_PATH
  const restore = () => {
    if (orig === undefined) delete process.env.FREEBUFF_CODEX_PATH
    else process.env.FREEBUFF_CODEX_PATH = orig
  }

  test('FREEBUFF_CODEX_PATH override wins when it points at a real file', () => {
    process.env.FREEBUFF_CODEX_PATH = process.execPath
    try {
      expect(resolveCodexExecutable()).toBe(process.execPath)
    } finally {
      restore()
    }
  })

  // With @openai/codex installed (dev/test), the resolver prefers the SDK's own
  // version-matched binary — signalled by returning undefined — over any
  // installed codex; we don't bundle the platform binary.
  test('prefers the SDK bundled binary (undefined) in dev when no override is set', () => {
    delete process.env.FREEBUFF_CODEX_PATH
    try {
      expect(resolveCodexExecutable()).toBeUndefined()
    } finally {
      restore()
    }
  })
})

describe('isCodexAvailable', () => {
  // In dev/test @openai/codex is installed (a dependency of @openai/codex-sdk),
  // so codex is available and the picker offers it.
  test('is true when the SDK binary is on disk (dev/test)', () => {
    expect(isCodexAvailable()).toBe(true)
  })
})
