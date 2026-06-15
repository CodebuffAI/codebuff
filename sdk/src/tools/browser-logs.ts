import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import net from 'net'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type {
  BrowserAction,
  BrowserResponse,
} from '@codebuff/common/browser-actions'
import type {
  Log,
  NetworkEvent,
} from '@codebuff/common/browser-actions'
import type { JSONValue } from '@codebuff/common/types/json'

type CdpResponse = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { message?: string }
}

type BrowserSession = {
  child: ChildProcess
  port: number
  userDataDir: string
  ws: WebSocket
  nextId: number
  pending: Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timeout: ReturnType<typeof setTimeout>
    }
  >
  eventWaiters: Map<string, Array<() => void>>
  logs: Log[]
  networks: NetworkEvent[]
  logOffset: number
  networkOffset: number
}

let browserSession: BrowserSession | null = null

export async function browserLogs(
  action: BrowserAction,
): Promise<CodebuffToolOutput<'browser_logs'>> {
  try {
    if (action.type === 'stop') {
      await stopBrowser()
      return [jsonResult({ success: true, action: action.type, logs: [] })]
    }

    const session = await ensureBrowserSession()
    await enablePageDomains(session)

    if (action.type === 'start' || action.type === 'navigate') {
      const url = normalizeBrowserUrl(action.url)
      const waitUntil = action.type === 'navigate' ? action.waitUntil : undefined
      await waitForCommand(
        session,
        'Page.navigate',
        { url },
        action.timeout ?? 15_000,
      )
      await waitForLoad(session, waitUntil, action.timeout ?? 15_000)
      return [jsonResult(await buildResponse(session, action.type))]
    }

    if (action.type === 'snapshot') {
      const snapshot = await evaluate(session, snapshotScript(), action.timeout)
      const response = await buildResponse(session, action.type, snapshot)
      if (isRecord(snapshot)) {
        response.text =
          typeof snapshot.text === 'string' ? snapshot.text : undefined
        response.elements =
          Array.isArray(snapshot.elements)
            ? (snapshot.elements as BrowserResponse['elements'])
          : undefined
      }
      return [jsonResult(response)]
    }

    if (action.type === 'screenshot') {
      const result = await waitForCommand(
        session,
        'Page.captureScreenshot',
        {
          format: action.screenshotCompression ?? 'jpeg',
          quality:
            action.screenshotCompression === 'png'
              ? undefined
              : (action.screenshotCompressionQuality ?? 70),
          captureBeyondViewport: action.fullPage ?? false,
        },
        action.timeout ?? 15_000,
      )
      const data = isRecord(result) && typeof result.data === 'string'
        ? result.data
        : ''
      const mediaType =
        action.screenshotCompression === 'png' ? 'image/png' : 'image/jpeg'
      return [
        jsonResult({
          ...(await buildResponse(session, action.type)),
          screenshotAttached: data.length > 0,
        }),
        ...(data ? [{ type: 'media' as const, data, mediaType }] : []),
      ]
    }

    if (action.type === 'click') {
      const result = await evaluate(
        session,
        clickScript(action.selector),
        action.timeout,
      )
      if (action.waitForNavigation) {
        await waitForLoad(session, 'load', action.timeout ?? 15_000)
      }
      return [jsonResult(await buildResponse(session, action.type, result))]
    }

    if (action.type === 'type') {
      const result = await evaluate(
        session,
        typeScript(action.selector, action.text),
        action.timeout,
      )
      return [jsonResult(await buildResponse(session, action.type, result))]
    }

    if (action.type === 'scroll') {
      const amount = action.amount ?? 600
      const delta = action.direction === 'up' ? -amount : amount
      const result = await evaluate(
        session,
        `window.scrollBy({ top: ${delta}, behavior: 'instant' }); ({ scrollY: window.scrollY })`,
        action.timeout,
      )
      return [jsonResult(await buildResponse(session, action.type, result))]
    }

    if (action.type === 'evaluate') {
      const result = await evaluate(session, action.script, action.timeout)
      return [jsonResult(await buildResponse(session, action.type, result))]
    }

    return [
      jsonResult({
        success: false,
        action: action.type,
        error: `Unsupported browser action: ${action.type}`,
        logs: [],
      }),
    ]
  } catch (error) {
    return [
      jsonResult({
        success: false,
        action: action.type,
        error: error instanceof Error ? error.message : String(error),
        logs: [],
      }),
    ]
  }
}

function jsonResult(value: BrowserResponse) {
  return { type: 'json' as const, value }
}

async function ensureBrowserSession(): Promise<BrowserSession> {
  if (browserSession && browserSession.child.exitCode === null) {
    return browserSession
  }

  const chrome = findChromeExecutable()
  const port = await getFreePort()
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'openbuff-browser-'))
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--window-size=1280,720',
      'about:blank',
    ],
    {
      stdio: ['ignore', 'ignore', 'ignore'],
    },
  )

  const pageWsUrl = await waitForPageWebSocketUrl(port)
  const ws = await openWebSocket(pageWsUrl)
  const session: BrowserSession = {
    child,
    port,
    userDataDir,
    ws,
    nextId: 1,
    pending: new Map(),
    eventWaiters: new Map(),
    logs: [],
    networks: [],
    logOffset: 0,
    networkOffset: 0,
  }

  ws.addEventListener('message', (event) => {
    handleCdpMessage(session, String(event.data))
  })
  child.on('exit', () => {
    if (browserSession === session) browserSession = null
  })
  browserSession = session
  return session
}

async function enablePageDomains(session: BrowserSession) {
  await Promise.all([
    waitForCommand(session, 'Page.enable'),
    waitForCommand(session, 'Runtime.enable'),
    waitForCommand(session, 'Log.enable'),
    waitForCommand(session, 'Network.enable'),
  ])
}

async function stopBrowser() {
  const session = browserSession
  browserSession = null
  if (!session) return
  try {
    session.ws.close()
  } catch {
    // ignore
  }
  for (const pending of session.pending.values()) {
    clearTimeout(pending.timeout)
    pending.reject(new Error('Browser session closed'))
  }
  session.pending.clear()
  try {
    session.child.kill()
  } catch {
    // ignore
  }
  try {
    rmSync(session.userDataDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

function handleCdpMessage(session: BrowserSession, raw: string) {
  let message: CdpResponse
  try {
    message = JSON.parse(raw) as CdpResponse
  } catch {
    return
  }

  if (typeof message.id === 'number') {
    const pending = session.pending.get(message.id)
    if (!pending) return
    session.pending.delete(message.id)
    clearTimeout(pending.timeout)
    if (message.error) {
      pending.reject(new Error(message.error.message ?? 'CDP command failed'))
      return
    }
    pending.resolve(message.result)
    return
  }

  if (message.method) {
    recordEvent(session, message)
    const waiters = session.eventWaiters.get(message.method)
    if (waiters) {
      session.eventWaiters.delete(message.method)
      for (const resolve of waiters) resolve()
    }
  }
}

function recordEvent(session: BrowserSession, message: CdpResponse) {
  const params = message.params ?? {}
  const timestamp = Date.now()
  if (message.method === 'Runtime.consoleAPICalled') {
    const args = Array.isArray(params.args) ? params.args : []
    session.logs.push({
      type: params.type === 'error' ? 'error' : 'info',
      message: args.map(formatRuntimeValue).join(' '),
      timestamp,
      source: 'browser',
    })
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = isRecord(params.exceptionDetails)
      ? params.exceptionDetails
      : {}
    session.logs.push({
      type: 'error',
      message:
        typeof details.text === 'string' ? details.text : 'Runtime exception',
      timestamp,
      source: 'browser',
    })
  }
  if (message.method === 'Log.entryAdded' && isRecord(params.entry)) {
    const entry = params.entry
    session.logs.push({
      type: entry.level === 'error' ? 'error' : 'info',
      message: typeof entry.text === 'string' ? entry.text : 'Log entry',
      timestamp,
      source: 'browser',
      location: typeof entry.url === 'string' ? entry.url : undefined,
    })
  }
  if (
    message.method === 'Network.responseReceived' &&
    isRecord(params.response)
  ) {
    const response = params.response
    session.networks.push({
      url: String(response.url ?? ''),
      method: String(params.type ?? 'GET'),
      status:
        typeof response.status === 'number' ? response.status : undefined,
      timestamp,
    })
  }
  if (message.method === 'Network.loadingFailed') {
    session.networks.push({
      url: String(params.requestId ?? ''),
      method: 'GET',
      errorText: String(params.errorText ?? 'Network request failed'),
      timestamp,
    })
  }
}

function waitForCommand(
  session: BrowserSession,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 15_000,
): Promise<unknown> {
  const id = session.nextId++
  const timeout = setTimeout(() => {
    const pending = session.pending.get(id)
    if (!pending) return
    session.pending.delete(id)
    pending.reject(new Error(`${method} timed out after ${timeoutMs}ms`))
  }, timeoutMs)

  const promise = new Promise<unknown>((resolve, reject) => {
    session.pending.set(id, { resolve, reject, timeout })
  })
  session.ws.send(JSON.stringify({ id, method, params }))
  return promise
}

async function waitForLoad(
  session: BrowserSession,
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle0' | undefined,
  timeoutMs: number,
) {
  const event =
    waitUntil === 'domcontentloaded'
      ? 'Page.domContentEventFired'
      : 'Page.loadEventFired'
  await waitForEvent(session, event, timeoutMs).catch(() => undefined)
  if (waitUntil === 'networkidle0') {
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
}

function waitForEvent(
  session: BrowserSession,
  eventName: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${eventName} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    const waiters = session.eventWaiters.get(eventName) ?? []
    waiters.push(() => {
      clearTimeout(timeout)
      resolve()
    })
    session.eventWaiters.set(eventName, waiters)
  })
}

async function evaluate(
  session: BrowserSession,
  expression: string,
  timeoutMs = 15_000,
): Promise<unknown> {
  const result = await waitForCommand(
    session,
    'Runtime.evaluate',
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    },
    timeoutMs,
  )
  if (!isRecord(result) || !isRecord(result.result)) return result
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails))
  }
  return result.result.value
}

async function buildResponse(
  session: BrowserSession,
  action: string,
  result?: unknown,
): Promise<BrowserResponse> {
  const pageInfo = await evaluate(
    session,
    '({ url: location.href, title: document.title })',
  ).catch(() => ({}))
  const newLogs = session.logs.slice(session.logOffset)
  const newNetworks = session.networks.slice(session.networkOffset)
  session.logOffset = session.logs.length
  session.networkOffset = session.networks.length

  const response: BrowserResponse = {
    success: true,
    action,
    url: isRecord(pageInfo) ? String(pageInfo.url ?? '') : undefined,
    title: isRecord(pageInfo) ? String(pageInfo.title ?? '') : undefined,
    logs: newLogs,
    networkEvents: newNetworks,
  }
  if (result !== undefined) {
    response.result = toJsonValue(result)
  }
  return response
}

async function waitForPageWebSocketUrl(port: number): Promise<string> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 10_000) {
    try {
      const pages = (await fetchJson(
        `http://127.0.0.1:${port}/json/list`,
      )) as Array<Record<string, unknown>>
      const page = pages.find((candidate) => candidate.type === 'page')
      if (page && typeof page.webSocketDebuggerUrl === 'string') {
        return page.webSocketDebuggerUrl
      }
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(
    `Chrome DevTools did not become ready: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`)
  }
  return response.json()
}

function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const timeout = setTimeout(() => {
      reject(new Error('Timed out connecting to Chrome DevTools'))
      ws.close()
    }, 10_000)
    ws.addEventListener('open', () => {
      clearTimeout(timeout)
      resolve(ws)
    })
    ws.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error('Failed to connect to Chrome DevTools'))
    })
  })
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('Could not allocate browser debugging port'))
        }
      })
    })
    server.on('error', reject)
  })
}

function findChromeExecutable(): string {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    'Chrome or Chromium was not found. Set CHROME_PATH to the browser executable.',
  )
}

export function normalizeBrowserUrl(url: string): string {
  const trimmed = url.trim()
  if (
    /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(
      trimmed,
    )
  ) {
    return `http://${trimmed}`
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function snapshotScript(): string {
  return `(() => {
    function selectorFor(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      const testId = el.getAttribute('data-testid');
      if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
      const aria = el.getAttribute('aria-label');
      if (aria) return el.tagName.toLowerCase() + '[aria-label="' + CSS.escape(aria) + '"]';
      const name = el.getAttribute('name');
      if (name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(name) + '"]';
      const parts = [];
      let node = el;
      while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
        let part = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
          if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        }
        parts.unshift(part);
        node = parent;
      }
      return parts.join(' > ');
    }
    const elements = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role],h1,h2,h3,p,li,label')).slice(0, 200).map((el, index) => ({
      index,
      tag: el.tagName.toLowerCase(),
      selector: selectorFor(el),
      text: (el.innerText || el.textContent || '').trim().slice(0, 300) || undefined,
      role: el.getAttribute('role') || undefined,
      label: el.getAttribute('aria-label') || el.getAttribute('alt') || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
    }));
    return {
      url: location.href,
      title: document.title,
      text: document.body.innerText.slice(0, 12000),
      elements,
    };
  })()`
}

function clickScript(selector: string): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('No element matches selector: ${escapeForJs(selector)}');
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return { clicked: ${JSON.stringify(selector)}, text: (el.innerText || el.textContent || '').trim() };
  })()`
}

function typeScript(selector: string, text: string): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('No element matches selector: ${escapeForJs(selector)}');
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.focus();
    el.value = ${JSON.stringify(text)};
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(text)} }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { typed: ${JSON.stringify(selector)}, value: el.value };
  })()`
}

function escapeForJs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function toJsonValue(value: unknown, seen = new WeakSet<object>()): JSONValue {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()
  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    return null
  }
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    const result = value.map((item) => toJsonValue(item, seen))
    seen.delete(value)
    return result
  }

  const result: Record<string, JSONValue> = {}
  for (const [key, child] of Object.entries(value)) {
    if (
      child === undefined ||
      typeof child === 'function' ||
      typeof child === 'symbol'
    ) {
      continue
    }
    result[key] = toJsonValue(child, seen)
  }
  seen.delete(value)
  return result
}

function formatRuntimeValue(value: unknown): string {
  if (!isRecord(value)) return String(value)
  if ('value' in value) return String(value.value)
  if (typeof value.description === 'string') return value.description
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
