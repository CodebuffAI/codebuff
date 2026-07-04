/**
 * A tiny, dependency-free MCP server that exposes the Freebuff custom tools
 * (suggest_prompts / write_doc / browser_check) over streamable HTTP on
 * localhost, so a harness whose CLI can only reach tools via MCP — namely Codex,
 * which has no in-process tool transport like the Claude Agent SDK — gets the
 * same tools the Codebuff/Claude harnesses do.
 *
 * Why HTTP and not stdio: the tool handlers must call THIS turn's engine
 * callbacks (`ThreadToolDeps` — onSuggest/onWriteDoc/onBrowserCheck), which live
 * in the orchestrator process. A stdio MCP server would run as a codex-spawned
 * subprocess with no way back to those closures; a localhost HTTP server we host
 * runs the handlers in-process, so they reach the deps directly. Codex connects
 * to it via `config.mcp_servers.freebuff.url` (see codex-harness.ts).
 *
 * Why hand-rolled and not `@modelcontextprotocol/sdk`: the monorepo pins zod to
 * v4 (root `overrides`), but the MCP SDK needs zod v3 and its internals throw
 * under v4. Rather than fight that, we implement the small JSON-RPC subset a
 * streamable-HTTP MCP client actually uses (initialize, tools/list, tools/call,
 * plus notifications/ping), which also drops a dependency. Tool INPUT schemas are
 * built from the shared THREAD_TOOL_SPECS' zod v4 raw shapes via `z.toJSONSchema`.
 *
 * Lifetime is one turn: start before the turn, `close()` in the turn's finally.
 * Each turn gets a fresh ephemeral port + a fresh deps closure, so concurrent
 * turns across tabs never cross wires.
 *
 * Access control: even though it's on 127.0.0.1 for a few seconds on a random
 * port, the handlers have side effects (write_doc writes files, browser_check
 * launches a browser), so we don't leave the door open to any local process or a
 * DNS-rebinding webpage. Every request must carry the per-turn bearer `token`
 * (handed to Codex via `mcp_servers.freebuff.http_headers`) AND a loopback `Host`.
 */

import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http'

import { z } from 'zod/v4'

import { THREAD_TOOL_SPECS, type ThreadToolDeps } from './thread-tools'

export interface FreebuffMcpHandle {
  /** The streamable-HTTP endpoint to hand to codex (`mcp_servers.freebuff.url`). */
  url: string
  /** Per-turn bearer token codex must send (`mcp_servers.freebuff.http_headers`);
   *  requests without it are rejected 401. */
  token: string
  /** Tear down the HTTP listener (call in the turn's finally). */
  close: () => Promise<void>
}

/** Host header values we accept — loopback only. A non-loopback Host means the
 *  request reached us via something other than a direct localhost connection
 *  (e.g. a DNS-rebinding webpage), so we reject it. The port varies (ephemeral),
 *  so we match on host, ignoring any `:port` suffix. */
function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase()
  return name === '127.0.0.1' || name === 'localhost' || name === '::1'
}

/** True when the request carries the exact `Bearer <token>` we minted for this
 *  turn. Length-agnostic compare is fine — the token is a fresh random UUID with
 *  no persistence, so this isn't a timing-attack surface. */
function hasToken(req: IncomingMessage, token: string): boolean {
  const auth = req.headers.authorization
  return typeof auth === 'string' && auth === `Bearer ${token}`
}

/** MCP protocol version we default to when a client doesn't pin one. We echo the
 *  client's requested version when present, so we stay compatible as it moves. */
const DEFAULT_PROTOCOL_VERSION = '2025-06-18'

/** JSON Schema for a tool's inputs, derived from its zod v4 raw shape. `$schema`
 *  is dropped (MCP `inputSchema` is a bare object schema; some clients dislike
 *  the extra key). */
function inputSchemaFor(shape: z.ZodRawShape): Record<string, unknown> {
  const schema = z.toJSONSchema(z.object(shape)) as Record<string, unknown>
  delete schema.$schema
  return schema
}

const toolList = () =>
  THREAD_TOOL_SPECS.map((s) => ({
    name: s.name,
    description: s.description,
    inputSchema: inputSchemaFor(s.shape),
  }))

type JsonRpcMessage = { jsonrpc?: string; id?: unknown; method?: string; params?: any }

/**
 * Handle one JSON-RPC message. Returns the response object, or null for a
 * notification (no `id` → nothing to reply with).
 */
async function handleRpc(deps: ThreadToolDeps, msg: JsonRpcMessage): Promise<unknown | null> {
  const { id, method, params } = msg
  const isNotification = id === undefined || id === null
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result })

  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion:
          typeof params?.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'freebuff', version: '1.0.0' },
      })

    // Lifecycle notifications carry no id and want no response.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null

    case 'ping':
      return ok({})

    case 'tools/list':
      return ok({ tools: toolList() })

    case 'tools/call': {
      const spec = THREAD_TOOL_SPECS.find((s) => s.name === params?.name)
      if (!spec) {
        return ok({ isError: true, content: [{ type: 'text', text: `Unknown tool: ${params?.name}` }] })
      }
      try {
        // Validate/parse with the spec's own zod shape before running (codex
        // should already respect the schema; this guarantees the run body's types).
        const args = z.object(spec.shape).parse(params?.arguments ?? {})
        const out = await spec.run(deps, args)
        return ok({ content: [{ type: 'text', text: JSON.stringify(out) }] })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // A tool error is reported IN the result (isError), not as a JSON-RPC
        // error, so the model sees it and can react.
        return ok({ isError: true, content: [{ type: 'text', text: message }] })
      }
    }

    default:
      if (isNotification) return null
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }
  }
}

/**
 * Start the Freebuff MCP server bound to the given per-turn tool deps. Resolves
 * once it's listening, with the URL to configure codex and a close handle.
 */
export async function startFreebuffMcpServer(deps: ThreadToolDeps): Promise<FreebuffMcpHandle> {
  const sessionId = randomUUID()
  const token = randomUUID()

  const http: HttpServer = createServer((req, res) => {
    // Gate every request on a loopback Host + the per-turn bearer token, so no
    // stray local process or DNS-rebinding webpage can reach the side-effecting
    // tools during the brief window this server is up.
    if (!isLoopbackHost(req.headers.host)) {
      res.statusCode = 403
      res.end()
      return
    }
    if (!hasToken(req, token)) {
      res.statusCode = 401
      res.end()
      return
    }

    // GET would open a server→client SSE stream; we don't push anything, so 405
    // tells the client "no standalone stream" (spec-allowed). DELETE ends the
    // session. Everything else must be a POST.
    if (req.method === 'GET' || req.method === 'DELETE') {
      res.statusCode = req.method === 'DELETE' ? 200 : 405
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }

    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      void (async () => {
        let payload: JsonRpcMessage | JsonRpcMessage[]
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }))
          return
        }

        const batch = Array.isArray(payload) ? payload : [payload]
        const responses = (await Promise.all(batch.map((m) => handleRpc(deps, m)))).filter(
          (r) => r !== null,
        )

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        // Streamable HTTP: the session id is established on initialize and echoed
        // by the client on later requests.
        if (batch.some((m) => m?.method === 'initialize')) headers['Mcp-Session-Id'] = sessionId

        // A batch of only notifications yields no responses → 202 Accepted.
        if (responses.length === 0) {
          res.writeHead(202, headers)
          res.end()
          return
        }
        res.writeHead(200, headers)
        res.end(JSON.stringify(Array.isArray(payload) ? responses : responses[0]))
      })()
    })
    req.on('error', () => {
      try {
        res.statusCode = 400
        res.end()
      } catch {
        /* response already gone */
      }
    })
  })

  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()))
  const addr = http.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  const url = `http://127.0.0.1:${port}/mcp`

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve) => http.close(() => resolve()))
  }

  return { url, token, close }
}
