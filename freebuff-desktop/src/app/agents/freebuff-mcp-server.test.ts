import { describe, expect, test } from 'bun:test'

import { startFreebuffMcpServer, type FreebuffMcpHandle } from './freebuff-mcp-server'
import type { ThreadToolDeps } from './thread-tools'

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
  return { deps, calls }
}

// The per-turn bearer token the running server requires — set by `start()`, so
// the `rpc` helper authenticates like codex does without threading it everywhere.
let authHeaders: Record<string, string> = {}

/** Minimal streamable-HTTP MCP client: POSTs one JSON-RPC message and returns the
 *  parsed body + the session id header (mirroring what codex's client does). */
async function rpc(url: string, msg: unknown, sessionId?: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...authHeaders,
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify(msg),
  })
  const sid = res.headers.get('Mcp-Session-Id') ?? undefined
  const text = await res.text()
  return { status: res.status, sid, body: text ? JSON.parse(text) : undefined }
}

async function initialize(url: string) {
  const init = await rpc(url, {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  })
  await rpc(url, { jsonrpc: '2.0', method: 'notifications/initialized' }, init.sid)
  return init
}

describe('startFreebuffMcpServer', () => {
  let handle: FreebuffMcpHandle | null = null
  const start = async (deps: ThreadToolDeps) => {
    handle = await startFreebuffMcpServer(deps)
    authHeaders = { Authorization: `Bearer ${handle.token}` }
    return handle
  }
  const stop = async () => {
    await handle?.close()
    handle = null
    authHeaders = {}
  }

  test('initialize returns a session id and advertises the tools capability', async () => {
    const { deps } = fakeDeps()
    const { url } = await start(deps)
    try {
      const init = await initialize(url)
      expect(init.status).toBe(200)
      expect(init.sid).toBeTruthy()
      expect(init.body.result.capabilities.tools).toBeTruthy()
      expect(init.body.result.serverInfo.name).toBe('freebuff')
    } finally {
      await stop()
    }
  })

  test('tools/list returns the three Freebuff tools with object input schemas', async () => {
    const { deps } = fakeDeps()
    const { url } = await start(deps)
    try {
      const init = await initialize(url)
      const list = await rpc(url, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, init.sid)
      const names = list.body.result.tools.map((t: { name: string }) => t.name)
      expect(names).toEqual(['suggest_prompts', 'write_doc', 'browser_check'])
      const suggest = list.body.result.tools[0]
      expect(suggest.inputSchema.type).toBe('object')
      expect(suggest.inputSchema.properties.prompts).toBeTruthy()
      expect('$schema' in suggest.inputSchema).toBe(false)
    } finally {
      await stop()
    }
  })

  test('tools/call suggest_prompts fires onSuggest and returns ok', async () => {
    const { deps, calls } = fakeDeps()
    const { url } = await start(deps)
    try {
      const init = await initialize(url)
      const call = await rpc(
        url,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'suggest_prompts',
            arguments: { prompts: [{ prompt: 'Add tests', label: 'Test' }, { prompt: '  ' }] },
          },
        },
        init.sid,
      )
      // Blank prompt filtered out by the spec's run body.
      expect(calls.suggested).toEqual([{ prompt: 'Add tests', label: 'Test' }])
      const payload = JSON.parse(call.body.result.content[0].text)
      expect(payload).toEqual({ ok: true, added: 1 })
    } finally {
      await stop()
    }
  })

  test('tools/call write_doc forwards to onWriteDoc and surfaces the cap error', async () => {
    const { deps, calls } = fakeDeps()
    const { url } = await start(deps)
    try {
      const init = await initialize(url)
      const okCall = await rpc(
        url,
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'write_doc', arguments: { name: 'learning', content: 'short' } },
        },
        init.sid,
      )
      expect(calls.docs).toEqual([{ name: 'learning', content: 'short', mode: 'append' }])
      expect(JSON.parse(okCall.body.result.content[0].text)).toEqual({ ok: true })

      const capped = await rpc(
        url,
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'write_doc', arguments: { name: 'technical', content: 'x'.repeat(200), mode: 'replace' } },
        },
        init.sid,
      )
      expect(JSON.parse(capped.body.result.content[0].text)).toEqual({ error: 'cap', message: 'too long' })
    } finally {
      await stop()
    }
  })

  test('tools/call browser_check forwards to onBrowserCheck', async () => {
    const { deps, calls } = fakeDeps()
    const { url } = await start(deps)
    try {
      const init = await initialize(url)
      const call = await rpc(
        url,
        { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'browser_check', arguments: {} } },
        init.sid,
      )
      expect(calls.browserChecks).toBe(1)
      expect(JSON.parse(call.body.result.content[0].text)).toMatchObject({ loaded: true, rendered: true })
    } finally {
      await stop()
    }
  })

  test('an unknown tool returns an isError result, not a crash', async () => {
    const { deps } = fakeDeps()
    const { url } = await start(deps)
    try {
      const init = await initialize(url)
      const call = await rpc(
        url,
        { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope', arguments: {} } },
        init.sid,
      )
      expect(call.body.result.isError).toBe(true)
    } finally {
      await stop()
    }
  })

  test('a bare notification gets 202 with no body', async () => {
    const { deps } = fakeDeps()
    const { url } = await start(deps)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      })
      expect(res.status).toBe(202)
      expect(await res.text()).toBe('')
    } finally {
      await stop()
    }
  })

  test('a request without the bearer token is rejected 401', async () => {
    const { deps, calls } = fakeDeps()
    const { url } = await start(deps)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // no Authorization
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'browser_check', arguments: {} } }),
      })
      expect(res.status).toBe(401)
      // The side-effecting handler must NOT have run.
      expect(calls.browserChecks).toBe(0)
    } finally {
      await stop()
    }
  })

  test('a wrong bearer token is rejected 401', async () => {
    const { deps } = fakeDeps()
    const { url } = await start(deps)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
      expect(res.status).toBe(401)
    } finally {
      await stop()
    }
  })

  test('a non-loopback Host is rejected 403 even with a valid token', async () => {
    const { deps } = fakeDeps()
    const { url, token } = await start(deps)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Host: 'evil.example.com',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
      expect(res.status).toBe(403)
    } finally {
      await stop()
    }
  })
})
