import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import net from 'net'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type {
  BrowserAction,
  BrowserResponse,
} from '@codebuff/common/browser-actions'
import type { Log, NetworkEvent } from '@codebuff/common/browser-actions'
import type { JSONValue } from '@codebuff/common/types/json'
import { getSdkEnv } from '../env'

type CdpResponse = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { message?: string }
}

type CdpPending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

type BrowserPage = {
  targetId: string
  ws: WebSocket
  nextId: number
  pending: Map<number, CdpPending>
  eventWaiters: Map<string, Array<() => void>>
  executionContexts: Map<string, number>
}

type RecordingState = {
  targetId: string
  startedAt: number
  frameCount: number
  frames: Array<{ data: string; timestamp: number }>
}

type BrowserSession = {
  child: ChildProcess
  port: number
  userDataDir: string
  pages: Map<string, BrowserPage>
  activeTargetId: string
  logs: Log[]
  networks: NetworkEvent[]
  logOffset: number
  networkOffset: number
  recording: RecordingState | null
}

type FrameTarget = {
  frameSelector?: string
  frameId?: string
  frameUrl?: string
  frameName?: string
}

type ElementPoint = {
  x: number
  y: number
  text?: string
  selector?: string
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])
const CRC_TABLE = makeCrcTable()

const browserSessions = new Map<string, BrowserSession>()
const DEFAULT_BROWSER_SESSION_KEY = 'default'

export async function browserLogs(
  action: BrowserAction,
  sessionKey = DEFAULT_BROWSER_SESSION_KEY,
): Promise<CodebuffToolOutput<'browser_logs'>> {
  try {
    if (action.type === 'stop') {
      await stopBrowserSession(sessionKey)
      return [jsonResult({ success: true, action: action.type, logs: [] })]
    }

    const session = await ensureBrowserSession(sessionKey)
    const page = await getActivePage(session)
    await enablePageDomains(page)

    if (action.type === 'start' || action.type === 'navigate') {
      const url = normalizeBrowserUrl(action.url)
      const waitUntil =
        action.type === 'navigate' ? action.waitUntil : undefined
      await waitForCommand(
        page,
        'Page.navigate',
        { url },
        action.timeout ?? 15_000,
      )
      await waitForLoad(page, waitUntil, action.timeout ?? 15_000)
      return [jsonResult(await buildResponse(session, page, action.type))]
    }

    if (action.type === 'snapshot') {
      const snapshot = await evaluateInTarget(
        page,
        snapshotScript(),
        action,
        action.timeout,
      )
      const response = await buildResponse(session, page, action.type, snapshot)
      if (isRecord(snapshot)) {
        response.text =
          typeof snapshot.text === 'string' ? snapshot.text : undefined
        response.elements = Array.isArray(snapshot.elements)
          ? (snapshot.elements as BrowserResponse['elements'])
          : undefined
      }
      return [jsonResult(response)]
    }

    if (action.type === 'screenshot') {
      const result = await captureScreenshot(page, {
        format: action.screenshotCompression ?? 'jpeg',
        quality:
          action.screenshotCompression === 'png'
            ? undefined
            : (action.screenshotCompressionQuality ?? 70),
        fullPage: action.fullPage ?? false,
        timeout: action.timeout,
      })
      const mediaType =
        action.screenshotCompression === 'png' ? 'image/png' : 'image/jpeg'
      return [
        jsonResult({
          ...(await buildResponse(session, page, action.type)),
          screenshotAttached: result.length > 0,
        }),
        ...(result
          ? [{ type: 'media' as const, data: result, mediaType }]
          : []),
      ]
    }

    if (action.type === 'click') {
      const result = await clickElement(page, action)
      if (action.waitForNavigation) {
        await waitForLoad(page, 'load', action.timeout ?? 15_000)
      }
      return [
        jsonResult(await buildResponse(session, page, action.type, result)),
      ]
    }

    if (action.type === 'type') {
      const result = await typeIntoElement(page, action)
      return [
        jsonResult(await buildResponse(session, page, action.type, result)),
      ]
    }

    if (action.type === 'key') {
      await dispatchKey(page, action.key, {
        text: action.text,
        command: action.command ?? 'press',
        modifiers: action.modifiers ?? [],
        timeout: action.timeout,
      })
      return [
        jsonResult(
          await buildResponse(session, page, action.type, {
            key: action.key,
            command: action.command ?? 'press',
          }),
        ),
      ]
    }

    if (action.type === 'mouse') {
      const point = action.selector
        ? await elementPoint(page, action.selector, action)
        : await pointInTarget(page, requirePoint(action.x, action.y), action)
      await dispatchMouse(page, action.event, point, {
        button: action.button ?? 'left',
        clickCount: action.clickCount ?? 1,
        timeout: action.timeout,
      })
      return [
        jsonResult(
          await buildResponse(session, page, action.type, {
            event: action.event,
            ...point,
          }),
        ),
      ]
    }

    if (action.type === 'hover') {
      const point = await elementPoint(page, action.selector, action)
      await dispatchMouse(page, 'move', point, {
        button: 'left',
        clickCount: 0,
        timeout: action.timeout,
      })
      return [
        jsonResult(await buildResponse(session, page, action.type, point)),
      ]
    }

    if (action.type === 'drag') {
      const result = await drag(page, action)
      return [
        jsonResult(await buildResponse(session, page, action.type, result)),
      ]
    }

    if (action.type === 'select') {
      const result = await evaluateInTarget(
        page,
        selectScript(action.selector, {
          value: action.value,
          label: action.label,
          index: action.index,
          frameSelector: action.frameSelector,
        }),
        action,
        action.timeout,
      )
      return [
        jsonResult(await buildResponse(session, page, action.type, result)),
      ]
    }

    if (action.type === 'scroll') {
      const amount = action.amount ?? 600
      const axis =
        action.direction === 'left' || action.direction === 'right'
          ? 'left'
          : 'top'
      const sign =
        action.direction === 'up' || action.direction === 'left' ? -1 : 1
      const result = await evaluateInTarget(
        page,
        scrollScript({
          selector: action.selector,
          frameSelector: action.frameSelector,
          axis,
          delta: sign * amount,
        }),
        action,
        action.timeout,
      )
      return [
        jsonResult(await buildResponse(session, page, action.type, result)),
      ]
    }

    if (action.type === 'evaluate') {
      const result = await evaluateInTarget(
        page,
        action.script,
        action,
        action.timeout,
      )
      return [
        jsonResult(await buildResponse(session, page, action.type, result)),
      ]
    }

    if (action.type === 'wait_for') {
      const result = await evaluateInTarget(
        page,
        waitForScript({
          selector: action.selector,
          text: action.text,
          visible: action.visible ?? true,
          pollInterval: action.pollInterval ?? 100,
          timeout: action.timeout ?? 15_000,
          frameSelector: action.frameSelector,
        }),
        action,
        action.timeout ?? 15_000,
      )
      return [
        jsonResult(await buildResponse(session, page, action.type, result)),
      ]
    }

    if (action.type === 'upload') {
      const result = await uploadFiles(
        page,
        action.selector,
        action.paths,
        action,
      )
      return [
        jsonResult(await buildResponse(session, page, action.type, result)),
      ]
    }

    if (action.type === 'cookie') {
      const result = await handleCookieAction(page, action)
      return [
        jsonResult(await buildResponse(session, page, action.type, result)),
      ]
    }

    if (action.type === 'storage') {
      const result = await evaluateInTarget(
        page,
        storageScript(
          action.storage,
          action.operation,
          action.key,
          action.value,
        ),
        action,
        action.timeout,
      )
      return [
        jsonResult(await buildResponse(session, page, action.type, result)),
      ]
    }

    if (action.type === 'viewport') {
      await waitForCommand(
        page,
        'Emulation.setDeviceMetricsOverride',
        {
          width: action.width,
          height: action.height,
          deviceScaleFactor: action.deviceScaleFactor ?? 1,
          mobile: action.isMobile ?? false,
          screenWidth: action.width,
          screenHeight: action.height,
          dontSetVisibleSize: false,
        },
        action.timeout ?? 15_000,
      )
      if (action.userAgent) {
        await waitForCommand(
          page,
          'Network.setUserAgentOverride',
          { userAgent: action.userAgent },
          action.timeout ?? 15_000,
        )
      }
      if (action.hasTouch !== undefined) {
        await waitForCommand(
          page,
          'Emulation.setTouchEmulationEnabled',
          { enabled: action.hasTouch },
          action.timeout ?? 15_000,
        )
      }
      return [
        jsonResult(
          await buildResponse(session, page, action.type, {
            width: action.width,
            height: action.height,
          }),
        ),
      ]
    }

    if (action.type === 'network') {
      const offline = action.offline ?? false
      await waitForCommand(
        page,
        'Network.emulateNetworkConditions',
        {
          offline,
          latency: action.latency ?? 0,
          downloadThroughput: offline ? 0 : (action.downloadThroughput ?? -1),
          uploadThroughput: offline ? 0 : (action.uploadThroughput ?? -1),
        },
        action.timeout ?? 15_000,
      )
      return [
        jsonResult(
          await buildResponse(session, page, action.type, {
            offline,
            latency: action.latency ?? 0,
          }),
        ),
      ]
    }

    if (action.type === 'tab') {
      const result = await handleTabAction(session, action)
      const activePage = await getActivePage(session)
      return [
        jsonResult(
          await buildResponse(session, activePage, action.type, result),
        ),
      ]
    }

    if (action.type === 'recording') {
      const output = await handleRecordingAction(session, page, action)
      return output
    }

    if (action.type === 'pdf') {
      const result = await waitForCommand(
        page,
        'Page.printToPDF',
        {
          landscape: action.landscape ?? false,
          printBackground: action.printBackground ?? true,
          scale: action.scale ?? 1,
          paperWidth: action.paperWidth,
          paperHeight: action.paperHeight,
        },
        action.timeout ?? 15_000,
      )
      const data =
        isRecord(result) && typeof result.data === 'string' ? result.data : ''
      return [
        jsonResult({
          ...(await buildResponse(session, page, action.type)),
          ...buildPdfAttachmentMetadata(data),
        }),
      ]
    }

    if (action.type === 'pixel_diff') {
      const output = await pixelDiff(session, page, action)
      return output
    }

    if (action.type === 'diagnose') {
      const results = []
      for (const step of action.steps.slice(
        0,
        action.maxSteps ?? action.steps.length,
      )) {
        const stepOutput = await browserLogs(step.action, sessionKey)
        const json = stepOutput.find((item) => item.type === 'json')
        results.push({
          label: step.label,
          response: json?.value ?? null,
          expectedLogs: step.expectedLogs,
          noJsErrors: step.noJsErrors,
          noNetworkErrors: step.noNetworkErrors,
          customCondition: step.customCondition,
        })
      }
      const activePage = await getActivePage(session)
      return [
        jsonResult(
          await buildResponse(session, activePage, action.type, { results }),
        ),
      ]
    }

    const unsupportedAction = action as BrowserAction
    return [
      jsonResult({
        success: false,
        action: unsupportedAction.type,
        error: `Unsupported browser action: ${unsupportedAction.type}`,
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

export function buildPdfAttachmentMetadata(data: string) {
  return {
    pdfAttached: data.length > 0,
    pdfBase64Length: data.length,
    pdfByteLength: data.length > 0 ? Buffer.byteLength(data, 'base64') : 0,
  }
}

async function ensureBrowserSession(
  sessionKey: string,
): Promise<BrowserSession> {
  const existingSession = browserSessions.get(sessionKey)
  if (existingSession && existingSession.child.exitCode === null) {
    return existingSession
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

  const target = await waitForPageTarget(port)
  const session: BrowserSession = {
    child,
    port,
    userDataDir,
    pages: new Map(),
    activeTargetId: target.id,
    logs: [],
    networks: [],
    logOffset: 0,
    networkOffset: 0,
    recording: null,
  }
  const page = await connectPage(
    session,
    target.id,
    target.webSocketDebuggerUrl,
  )
  session.pages.set(target.id, page)

  child.on('exit', () => {
    if (browserSessions.get(sessionKey) === session) {
      browserSessions.delete(sessionKey)
    }
  })
  browserSessions.set(sessionKey, session)
  return session
}

async function connectPage(
  session: BrowserSession,
  targetId: string,
  webSocketDebuggerUrl: string,
): Promise<BrowserPage> {
  const existing = session.pages.get(targetId)
  if (existing && existing.ws.readyState === WebSocket.OPEN) return existing

  const ws = await openWebSocket(webSocketDebuggerUrl)
  const page: BrowserPage = {
    targetId,
    ws,
    nextId: 1,
    pending: new Map(),
    eventWaiters: new Map(),
    executionContexts: new Map(),
  }
  ws.addEventListener('message', (event) => {
    handleCdpMessage(session, page, String(event.data))
  })
  ws.addEventListener('close', () => {
    for (const pending of page.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Browser target closed'))
    }
    page.pending.clear()
  })
  await enablePageDomains(page)
  return page
}

async function getActivePage(session: BrowserSession): Promise<BrowserPage> {
  const existing = session.pages.get(session.activeTargetId)
  if (existing && existing.ws.readyState === WebSocket.OPEN) return existing

  const target = (await listTargets(session.port)).find(
    (candidate) => candidate.id === session.activeTargetId,
  )
  if (!target?.webSocketDebuggerUrl) {
    throw new Error(
      `Active browser target not found: ${session.activeTargetId}`,
    )
  }
  const page = await connectPage(
    session,
    target.id,
    target.webSocketDebuggerUrl,
  )
  session.pages.set(target.id, page)
  return page
}

async function enablePageDomains(page: BrowserPage) {
  await Promise.all([
    waitForCommand(page, 'Page.enable'),
    waitForCommand(page, 'Runtime.enable'),
    waitForCommand(page, 'Log.enable'),
    waitForCommand(page, 'Network.enable'),
    waitForCommand(page, 'DOM.enable'),
  ])
}

export async function stopBrowserSession(sessionKey: string) {
  const session = browserSessions.get(sessionKey)
  browserSessions.delete(sessionKey)
  if (!session) return
  for (const page of session.pages.values()) {
    try {
      page.ws.close()
    } catch {
      // ignore
    }
    for (const pending of page.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Browser session closed'))
    }
    page.pending.clear()
  }
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

export async function stopBrowserSessionsByPrefix(prefix: string) {
  const keys = [...browserSessions.keys()].filter((key) =>
    key.startsWith(prefix),
  )
  await Promise.all(keys.map((key) => stopBrowserSession(key)))
}

function handleCdpMessage(
  session: BrowserSession,
  page: BrowserPage,
  raw: string,
) {
  let message: CdpResponse
  try {
    message = JSON.parse(raw) as CdpResponse
  } catch {
    return
  }

  if (typeof message.id === 'number') {
    const pending = page.pending.get(message.id)
    if (!pending) return
    page.pending.delete(message.id)
    clearTimeout(pending.timeout)
    if (message.error) {
      pending.reject(new Error(message.error.message ?? 'CDP command failed'))
      return
    }
    pending.resolve(message.result)
    return
  }

  if (message.method) {
    recordEvent(session, page, message)
    const waiters = page.eventWaiters.get(message.method)
    if (waiters) {
      page.eventWaiters.delete(message.method)
      for (const resolve of waiters) resolve()
    }
  }
}

function recordEvent(
  session: BrowserSession,
  page: BrowserPage,
  message: CdpResponse,
) {
  const params = message.params ?? {}
  const timestamp = Date.now()
  if (message.method === 'Runtime.executionContextCreated') {
    const context = isRecord(params.context) ? params.context : {}
    const auxData = isRecord(context.auxData) ? context.auxData : {}
    if (typeof context.id === 'number' && typeof auxData.frameId === 'string') {
      page.executionContexts.set(auxData.frameId, context.id)
    }
  }
  if (message.method === 'Runtime.executionContextDestroyed') {
    const id =
      typeof params.executionContextId === 'number'
        ? params.executionContextId
        : undefined
    if (id !== undefined) {
      for (const [frameId, contextId] of page.executionContexts) {
        if (contextId === id) page.executionContexts.delete(frameId)
      }
    }
  }
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
      status: typeof response.status === 'number' ? response.status : undefined,
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
  if (message.method === 'Page.screencastFrame' && session.recording) {
    const data = typeof params.data === 'string' ? params.data : undefined
    if (data && session.recording.targetId === page.targetId) {
      session.recording.frames.push({ data, timestamp })
      session.recording.frameCount++
    }
    if (typeof params.sessionId === 'number') {
      void waitForCommand(page, 'Page.screencastFrameAck', {
        sessionId: params.sessionId,
      }).catch(() => undefined)
    }
  }
}

function waitForCommand(
  page: BrowserPage,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 15_000,
): Promise<unknown> {
  const id = page.nextId++
  const timeout = setTimeout(() => {
    const pending = page.pending.get(id)
    if (!pending) return
    page.pending.delete(id)
    pending.reject(new Error(`${method} timed out after ${timeoutMs}ms`))
  }, timeoutMs)

  const promise = new Promise<unknown>((resolve, reject) => {
    page.pending.set(id, { resolve, reject, timeout })
  })
  page.ws.send(JSON.stringify({ id, method, params }))
  return promise
}

async function waitForLoad(
  page: BrowserPage,
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle0' | undefined,
  timeoutMs: number,
) {
  const event =
    waitUntil === 'domcontentloaded'
      ? 'Page.domContentEventFired'
      : 'Page.loadEventFired'
  await waitForEvent(page, event, timeoutMs).catch(() => undefined)
  if (waitUntil === 'networkidle0') {
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
}

function waitForEvent(
  page: BrowserPage,
  eventName: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${eventName} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    const waiters = page.eventWaiters.get(eventName) ?? []
    waiters.push(() => {
      clearTimeout(timeout)
      resolve()
    })
    page.eventWaiters.set(eventName, waiters)
  })
}

async function evaluate(
  page: BrowserPage,
  expression: string,
  timeoutMs = 15_000,
  contextId?: number,
): Promise<unknown> {
  const result = await waitForCommand(
    page,
    'Runtime.evaluate',
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
      contextId,
    },
    timeoutMs,
  )
  if (!isRecord(result) || !isRecord(result.result)) return result
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails))
  }
  return result.result.value
}

async function evaluateInTarget(
  page: BrowserPage,
  expression: string,
  target: FrameTarget,
  timeoutMs = 15_000,
): Promise<unknown> {
  const contextId = await resolveExecutionContext(page, target, timeoutMs)
  return evaluate(page, expression, timeoutMs, contextId)
}

async function resolveExecutionContext(
  page: BrowserPage,
  target: FrameTarget,
  timeoutMs: number,
): Promise<number | undefined> {
  const frameId = await resolveFrameId(page, target, timeoutMs)
  if (!frameId) return undefined
  const context = page.executionContexts.get(frameId)
  if (context !== undefined) return context
  await waitForEvent(page, 'Runtime.executionContextCreated', timeoutMs).catch(
    () => undefined,
  )
  const contextAfterWait = page.executionContexts.get(frameId)
  if (contextAfterWait === undefined) {
    throw new Error(`No execution context found for frame: ${frameId}`)
  }
  return contextAfterWait
}

async function resolveFrameId(
  page: BrowserPage,
  target: FrameTarget,
  timeoutMs: number,
): Promise<string | undefined> {
  if (target.frameSelector) return undefined
  if (!target.frameId && !target.frameUrl && !target.frameName) return undefined
  const frameId =
    target.frameId ??
    (await findFrameId(page, target.frameUrl, target.frameName, timeoutMs))
  if (!frameId) throw new Error('No matching frame found')
  return frameId
}

async function findFrameId(
  page: BrowserPage,
  frameUrl: string | undefined,
  frameName: string | undefined,
  timeoutMs: number,
): Promise<string | undefined> {
  const result = await waitForCommand(page, 'Page.getFrameTree', {}, timeoutMs)
  const frames: Record<string, unknown>[] = []
  collectFrames(isRecord(result) ? result.frameTree : undefined, frames)
  const match = frames.find((frame) => {
    const urlMatches = frameUrl
      ? String(frame.url ?? '').includes(frameUrl)
      : true
    const nameMatches = frameName
      ? String(frame.name ?? '') === frameName
      : true
    return urlMatches && nameMatches
  })
  return typeof match?.id === 'string' ? match.id : undefined
}

function collectFrames(value: unknown, frames: Record<string, unknown>[]) {
  if (!isRecord(value)) return
  if (isRecord(value.frame)) frames.push(value.frame)
  if (Array.isArray(value.childFrames)) {
    for (const child of value.childFrames) collectFrames(child, frames)
  }
}

async function buildResponse(
  session: BrowserSession,
  page: BrowserPage,
  action: string,
  result?: unknown,
): Promise<BrowserResponse> {
  const pageInfo = await evaluate(
    page,
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

async function waitForPageTarget(port: number): Promise<BrowserTarget> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 10_000) {
    try {
      const pages = await listTargets(port)
      const page = pages.find((candidate) => candidate.type === 'page')
      if (page?.webSocketDebuggerUrl) return page
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

type BrowserTarget = {
  id: string
  type?: string
  url?: string
  title?: string
  webSocketDebuggerUrl: string
}

async function listTargets(port: number): Promise<BrowserTarget[]> {
  const raw = (await fetchJson(`http://127.0.0.1:${port}/json/list`)) as Array<
    Record<string, unknown>
  >
  return raw
    .filter(
      (
        item,
      ): item is Record<string, unknown> & {
        id: string
        webSocketDebuggerUrl: string
      } =>
        typeof item.id === 'string' &&
        typeof item.webSocketDebuggerUrl === 'string',
    )
    .map((item) => ({
      id: item.id,
      type: typeof item.type === 'string' ? item.type : undefined,
      url: typeof item.url === 'string' ? item.url : undefined,
      title: typeof item.title === 'string' ? item.title : undefined,
      webSocketDebuggerUrl: item.webSocketDebuggerUrl,
    }))
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)
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
  const env = getSdkEnv()
  const candidates = [
    env.CHROME_PATH,
    env.CHROMIUM_PATH,
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

async function captureScreenshot(
  page: BrowserPage,
  params: {
    format: 'jpeg' | 'png'
    quality: number | undefined
    fullPage: boolean
    timeout: number | undefined
  },
): Promise<string> {
  const result = await waitForCommand(
    page,
    'Page.captureScreenshot',
    {
      format: params.format,
      quality: params.format === 'png' ? undefined : params.quality,
      captureBeyondViewport: params.fullPage,
    },
    params.timeout ?? 15_000,
  )
  return isRecord(result) && typeof result.data === 'string' ? result.data : ''
}

async function clickElement(
  page: BrowserPage,
  action: Extract<BrowserAction, { type: 'click' }>,
): Promise<unknown> {
  if (action.x !== undefined || action.y !== undefined) {
    const point = await pointInTarget(
      page,
      requirePoint(action.x, action.y),
      action,
    )
    await dispatchMouse(page, 'click', point, {
      button: action.button ?? 'left',
      clickCount: action.clickCount ?? 1,
      timeout: action.timeout,
    })
    return { clicked: point }
  }
  if (!action.selector) throw new Error('click requires selector or x/y')
  const point = await elementPoint(page, action.selector, action)
  await dispatchMouse(page, 'click', point, {
    button: action.button ?? 'left',
    clickCount: action.clickCount ?? 1,
    timeout: action.timeout,
  })
  return { clicked: action.selector, ...point }
}

async function typeIntoElement(
  page: BrowserPage,
  action: Extract<BrowserAction, { type: 'type' }>,
): Promise<unknown> {
  await evaluateInTarget(
    page,
    focusScript(action.selector, action.frameSelector),
    action,
    action.timeout,
  )
  if (action.clear) {
    await dispatchKey(page, 'a', {
      command: 'press',
      modifiers: process.platform === 'darwin' ? ['Meta'] : ['Control'],
      timeout: action.timeout,
    })
    await dispatchKey(page, 'Backspace', {
      command: 'press',
      modifiers: [],
      timeout: action.timeout,
    })
  }
  if (action.inputMode === 'setValue') {
    return evaluateInTarget(
      page,
      typeScript(action.selector, action.text, action.frameSelector),
      action,
      action.timeout,
    )
  }
  await waitForCommand(
    page,
    'Input.insertText',
    { text: action.text },
    action.timeout ?? 15_000,
  )
  if (action.pressEnter) {
    await dispatchKey(page, 'Enter', {
      command: 'press',
      modifiers: [],
      timeout: action.timeout,
    })
  }
  return evaluateInTarget(
    page,
    `(() => {
      const el = ${queryExpression(action.selector, action.frameSelector)};
      return { typed: ${JSON.stringify(action.selector)}, value: 'value' in el ? el.value : el.textContent };
    })()`,
    action,
    action.timeout,
  )
}

async function dispatchKey(
  page: BrowserPage,
  key: string,
  params: {
    text?: string
    command: 'press' | 'down' | 'up'
    modifiers: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>
    timeout?: number
  },
) {
  const definition = keyDefinition(key, params.text)
  const modifiers = modifierBitmask(params.modifiers)
  if (params.command === 'press' || params.command === 'down') {
    await waitForCommand(
      page,
      'Input.dispatchKeyEvent',
      {
        type: definition.text ? 'keyDown' : 'rawKeyDown',
        key: definition.key,
        code: definition.code,
        text: definition.text,
        unmodifiedText: definition.text,
        windowsVirtualKeyCode: definition.keyCode,
        nativeVirtualKeyCode: definition.keyCode,
        modifiers,
      },
      params.timeout ?? 15_000,
    )
  }
  if (params.command === 'press' || params.command === 'up') {
    await waitForCommand(
      page,
      'Input.dispatchKeyEvent',
      {
        type: 'keyUp',
        key: definition.key,
        code: definition.code,
        windowsVirtualKeyCode: definition.keyCode,
        nativeVirtualKeyCode: definition.keyCode,
        modifiers,
      },
      params.timeout ?? 15_000,
    )
  }
}

async function dispatchMouse(
  page: BrowserPage,
  event: 'move' | 'down' | 'up' | 'click',
  point: { x: number; y: number },
  params: {
    button: 'left' | 'right' | 'middle'
    clickCount: number
    timeout?: number
  },
) {
  const timeout = params.timeout ?? 15_000
  if (event === 'move' || event === 'click') {
    await waitForCommand(
      page,
      'Input.dispatchMouseEvent',
      {
        type: 'mouseMoved',
        x: point.x,
        y: point.y,
        button: 'none',
        clickCount: 0,
      },
      timeout,
    )
  }
  if (event === 'down' || event === 'click') {
    await waitForCommand(
      page,
      'Input.dispatchMouseEvent',
      {
        type: 'mousePressed',
        x: point.x,
        y: point.y,
        button: params.button,
        clickCount: params.clickCount,
      },
      timeout,
    )
  }
  if (event === 'up' || event === 'click') {
    await waitForCommand(
      page,
      'Input.dispatchMouseEvent',
      {
        type: 'mouseReleased',
        x: point.x,
        y: point.y,
        button: params.button,
        clickCount: params.clickCount,
      },
      timeout,
    )
  }
}

async function drag(
  page: BrowserPage,
  action: Extract<BrowserAction, { type: 'drag' }>,
): Promise<unknown> {
  const start = action.fromSelector
    ? await elementPoint(page, action.fromSelector, action)
    : await pointInTarget(
        page,
        requirePoint(action.fromX, action.fromY),
        action,
      )
  const end = action.toSelector
    ? await elementPoint(page, action.toSelector, action)
    : await pointInTarget(page, requirePoint(action.toX, action.toY), action)
  const steps = action.steps ?? 12
  await dispatchMouse(page, 'move', start, {
    button: 'left',
    clickCount: 0,
    timeout: action.timeout,
  })
  await dispatchMouse(page, 'down', start, {
    button: 'left',
    clickCount: 1,
    timeout: action.timeout,
  })
  for (let i = 1; i <= steps; i++) {
    const point = {
      x: start.x + ((end.x - start.x) * i) / steps,
      y: start.y + ((end.y - start.y) * i) / steps,
    }
    await dispatchMouse(page, 'move', point, {
      button: 'left',
      clickCount: 0,
      timeout: action.timeout,
    })
  }
  await dispatchMouse(page, 'up', end, {
    button: 'left',
    clickCount: 1,
    timeout: action.timeout,
  })
  return { from: start, to: end, steps }
}

async function elementPoint(
  page: BrowserPage,
  selector: string,
  target: FrameTarget & { timeout?: number },
): Promise<ElementPoint> {
  const result = await evaluateInTarget(
    page,
    elementPointScript(selector, target.frameSelector),
    target,
    target.timeout,
  )
  if (!isRecord(result))
    throw new Error(`Could not locate element: ${selector}`)
  const frameId = await resolveFrameId(page, target, target.timeout ?? 15_000)
  const frameOffset = frameId
    ? await frameViewportOffset(page, frameId, target.timeout ?? 15_000)
    : { x: 0, y: 0 }
  const point = translateFramePoint(
    { x: Number(result.x), y: Number(result.y) },
    frameOffset,
  )
  return {
    ...point,
    text: typeof result.text === 'string' ? result.text : undefined,
    selector,
  }
}

async function pointInTarget(
  page: BrowserPage,
  point: { x: number; y: number },
  target: FrameTarget & { timeout?: number },
): Promise<{ x: number; y: number }> {
  const timeoutMs = target.timeout ?? 15_000
  if (target.frameSelector) {
    return translateFramePoint(
      point,
      await frameSelectorViewportOffset(page, target.frameSelector, timeoutMs),
    )
  }

  const frameId = await resolveFrameId(page, target, timeoutMs)
  if (!frameId) return point
  return translateFramePoint(
    point,
    await frameViewportOffset(page, frameId, timeoutMs),
  )
}

async function frameSelectorViewportOffset(
  page: BrowserPage,
  frameSelector: string,
  timeoutMs: number,
): Promise<{ x: number; y: number }> {
  const result = await evaluate(
    page,
    frameSelectorOffsetScript(frameSelector),
    timeoutMs,
  )
  if (
    !isRecord(result) ||
    typeof result.x !== 'number' ||
    typeof result.y !== 'number'
  ) {
    throw new Error('Could not resolve frame viewport offset')
  }
  return { x: result.x, y: result.y }
}

async function frameViewportOffset(
  page: BrowserPage,
  frameId: string,
  timeoutMs: number,
): Promise<{ x: number; y: number }> {
  const owner = await waitForCommand(
    page,
    'DOM.getFrameOwner',
    { frameId },
    timeoutMs,
  )
  const backendNodeId =
    isRecord(owner) && typeof owner.backendNodeId === 'number'
      ? owner.backendNodeId
      : undefined
  if (backendNodeId === undefined)
    throw new Error('Could not resolve frame owner')
  const model = await waitForCommand(
    page,
    'DOM.getBoxModel',
    { backendNodeId },
    timeoutMs,
  )
  const content =
    isRecord(model) &&
    isRecord(model.model) &&
    Array.isArray(model.model.content)
      ? model.model.content
      : undefined
  if (
    !content ||
    typeof content[0] !== 'number' ||
    typeof content[1] !== 'number'
  ) {
    throw new Error('Could not resolve frame viewport offset')
  }
  return { x: content[0], y: content[1] }
}

export function translateFramePoint(
  point: { x: number; y: number },
  offset: { x: number; y: number },
): { x: number; y: number } {
  return { x: offset.x + point.x, y: offset.y + point.y }
}

function requirePoint(
  x: number | undefined,
  y: number | undefined,
): { x: number; y: number } {
  if (x === undefined || y === undefined)
    throw new Error('x and y are required')
  return { x, y }
}

async function uploadFiles(
  page: BrowserPage,
  selector: string,
  paths: string[],
  target: FrameTarget & { timeout?: number },
): Promise<unknown> {
  if (
    target.frameSelector ||
    target.frameId ||
    target.frameUrl ||
    target.frameName
  ) {
    throw new Error('upload currently supports top-level file inputs only')
  }
  const documentResult = await waitForCommand(
    page,
    'DOM.getDocument',
    { depth: -1, pierce: true },
    target.timeout ?? 15_000,
  )
  const root =
    isRecord(documentResult) && isRecord(documentResult.root)
      ? documentResult.root
      : null
  const nodeId = typeof root?.nodeId === 'number' ? root.nodeId : undefined
  if (nodeId === undefined) throw new Error('Could not resolve DOM document')
  const nodeResult = await waitForCommand(
    page,
    'DOM.querySelector',
    { nodeId, selector },
    target.timeout ?? 15_000,
  )
  const inputNodeId =
    isRecord(nodeResult) && typeof nodeResult.nodeId === 'number'
      ? nodeResult.nodeId
      : 0
  if (!inputNodeId) throw new Error(`No element matches selector: ${selector}`)
  await waitForCommand(
    page,
    'DOM.setFileInputFiles',
    {
      nodeId: inputNodeId,
      files: paths.map((filePath) => path.resolve(filePath)),
    },
    target.timeout ?? 15_000,
  )
  return { uploaded: paths.length, selector }
}

async function handleCookieAction(
  page: BrowserPage,
  action: Extract<BrowserAction, { type: 'cookie' }>,
): Promise<unknown> {
  if (action.operation === 'get') {
    return waitForCommand(
      page,
      'Network.getCookies',
      { urls: action.url ? [action.url] : undefined },
      action.timeout ?? 15_000,
    )
  }
  if (action.operation === 'set') {
    if (!action.name || action.value === undefined) {
      throw new Error('cookie set requires name and value')
    }
    return waitForCommand(
      page,
      'Network.setCookie',
      {
        name: action.name,
        value: action.value,
        url: action.url,
        domain: action.domain,
        path: action.path,
        expires: action.expires,
        httpOnly: action.httpOnly,
        secure: action.secure,
        sameSite: action.sameSite,
      },
      action.timeout ?? 15_000,
    )
  }
  if (action.operation === 'delete') {
    if (!action.name) throw new Error('cookie delete requires name')
    return waitForCommand(
      page,
      'Network.deleteCookies',
      {
        name: action.name,
        url: action.url,
        domain: action.domain,
        path: action.path,
      },
      action.timeout ?? 15_000,
    )
  }
  return waitForCommand(
    page,
    'Network.clearBrowserCookies',
    {},
    action.timeout ?? 15_000,
  )
}

async function handleTabAction(
  session: BrowserSession,
  action: Extract<BrowserAction, { type: 'tab' }>,
): Promise<unknown> {
  if (action.operation === 'list') {
    return { tabs: await tabsResult(session) }
  }
  if (action.operation === 'create') {
    const raw = await fetchJson(
      `http://127.0.0.1:${session.port}/json/new?${encodeURIComponent(
        normalizeBrowserUrl(action.url ?? 'about:blank'),
      )}`,
      { method: 'PUT' },
    )
    if (
      !isRecord(raw) ||
      typeof raw.id !== 'string' ||
      typeof raw.webSocketDebuggerUrl !== 'string'
    ) {
      throw new Error('Chrome did not return a new tab target')
    }
    const page = await connectPage(session, raw.id, raw.webSocketDebuggerUrl)
    session.pages.set(raw.id, page)
    session.activeTargetId = raw.id
    return { targetId: raw.id, tabs: await tabsResult(session) }
  }
  const targetId = await resolveTabId(session, action)
  if (!targetId) throw new Error('No matching tab found')
  if (action.operation === 'switch') {
    const target = (await listTargets(session.port)).find(
      (item) => item.id === targetId,
    )
    if (!target?.webSocketDebuggerUrl)
      throw new Error('Target has no websocket URL')
    const page = await connectPage(
      session,
      target.id,
      target.webSocketDebuggerUrl,
    )
    session.pages.set(target.id, page)
    session.activeTargetId = target.id
    await fetch(
      `http://127.0.0.1:${session.port}/json/activate/${target.id}`,
    ).catch(() => undefined)
    return { targetId, tabs: await tabsResult(session) }
  }
  if (action.operation === 'close') {
    if (session.pages.size <= 1)
      throw new Error('Cannot close the last browser tab')
    await fetch(
      `http://127.0.0.1:${session.port}/json/close/${targetId}`,
    ).catch(() => undefined)
    const page = session.pages.get(targetId)
    page?.ws.close()
    session.pages.delete(targetId)
    if (session.activeTargetId === targetId) {
      const nextTarget = (await listTargets(session.port)).find(
        (item) => item.type === 'page',
      )
      if (!nextTarget) throw new Error('No browser tabs remain')
      session.activeTargetId = nextTarget.id
    }
    return { closed: targetId, tabs: await tabsResult(session) }
  }
  return { tabs: await tabsResult(session) }
}

async function tabsResult(session: BrowserSession) {
  return (await listTargets(session.port))
    .filter((target) => target.type === 'page')
    .map((target) => ({
      targetId: target.id,
      url: target.url,
      title: target.title,
      active: target.id === session.activeTargetId,
    }))
}

async function resolveTabId(
  session: BrowserSession,
  action: Extract<BrowserAction, { type: 'tab' }>,
): Promise<string | undefined> {
  if (action.targetId) return action.targetId
  const tabs = await listTargets(session.port)
  return tabs.find((target) => {
    const titleMatches = action.titleIncludes
      ? (target.title ?? '').includes(action.titleIncludes)
      : true
    const urlMatches = action.urlIncludes
      ? (target.url ?? '').includes(action.urlIncludes)
      : true
    return target.type === 'page' && titleMatches && urlMatches
  })?.id
}

async function handleRecordingAction(
  session: BrowserSession,
  page: BrowserPage,
  action: Extract<BrowserAction, { type: 'recording' }>,
): Promise<CodebuffToolOutput<'browser_logs'>> {
  if (action.operation === 'start') {
    if (session.recording)
      throw new Error('A browser recording is already active')
    session.recording = {
      targetId: page.targetId,
      startedAt: Date.now(),
      frameCount: 0,
      frames: [],
    }
    await waitForCommand(
      page,
      'Page.startScreencast',
      {
        format: 'png',
        everyNthFrame: action.everyNthFrame ?? 1,
        quality: action.quality ?? 80,
      },
      action.timeout ?? 15_000,
    )
    return [
      jsonResult(
        await buildResponse(session, page, action.type, {
          recording: 'started',
        }),
      ),
    ]
  }

  const recording = session.recording
  if (!recording) throw new Error('No browser recording is active')
  session.recording = null
  await waitForCommand(
    page,
    'Page.stopScreencast',
    {},
    action.timeout ?? 15_000,
  ).catch(() => undefined)
  const apng = buildApng(
    recording.frames.map((frame) => Buffer.from(frame.data, 'base64')),
  )
  return [
    jsonResult({
      ...(await buildResponse(session, page, action.type, {
        recording: 'stopped',
        frameCount: recording.frameCount,
        durationMs: Date.now() - recording.startedAt,
      })),
      recordingAttached: apng.length > 0,
    }),
    ...(apng.length > 0
      ? [
          {
            type: 'media' as const,
            data: apng.toString('base64'),
            mediaType: 'image/apng',
          },
        ]
      : []),
  ]
}

async function pixelDiff(
  session: BrowserSession,
  page: BrowserPage,
  action: Extract<BrowserAction, { type: 'pixel_diff' }>,
): Promise<CodebuffToolOutput<'browser_logs'>> {
  const actualBase64 = await captureScreenshot(page, {
    format: 'png',
    quality: undefined,
    fullPage: action.fullPage ?? false,
    timeout: action.timeout,
  })
  const expectedBuffer = action.expectedImageBase64
    ? Buffer.from(action.expectedImageBase64, 'base64')
    : action.expectedImagePath
      ? readFileSync(path.resolve(action.expectedImagePath))
      : undefined
  if (!expectedBuffer) {
    throw new Error(
      'pixel_diff requires expectedImagePath or expectedImageBase64',
    )
  }
  const actual = PNG.sync.read(Buffer.from(actualBase64, 'base64'))
  const expected = PNG.sync.read(expectedBuffer)
  const width = Math.min(actual.width, expected.width)
  const height = Math.min(actual.height, expected.height)
  const diff = new PNG({ width, height })
  const mismatchedPixels = pixelmatch(
    cropPngData(actual, width, height),
    cropPngData(expected, width, height),
    diff.data,
    width,
    height,
    { threshold: action.threshold ?? 0.1 },
  )
  const totalPixels = width * height
  const mismatchRatio = totalPixels === 0 ? 0 : mismatchedPixels / totalPixels
  const diffBase64 = PNG.sync.write(diff).toString('base64')
  return [
    jsonResult({
      ...(await buildResponse(session, page, action.type, {
        width,
        height,
        actualWidth: actual.width,
        actualHeight: actual.height,
        expectedWidth: expected.width,
        expectedHeight: expected.height,
        mismatchedPixels,
        totalPixels,
        mismatchRatio,
      })),
      diffAttached: true,
    }),
    { type: 'media' as const, data: diffBase64, mediaType: 'image/png' },
  ]
}

function cropPngData(png: PNG, width: number, height: number): Uint8Array {
  if (png.width === width && png.height === height) return png.data
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sourceStart = y * png.width * 4
    const targetStart = y * width * 4
    png.data.copy(data, targetStart, sourceStart, sourceStart + width * 4)
  }
  return data
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

export function frameSelectorOffsetScript(frameSelector: string): string {
  return `(() => {
    const frame = document.querySelector(${JSON.stringify(frameSelector)});
    if (!frame) throw new Error('No frame matches selector: ${escapeForJs(frameSelector)}');
    const rect = frame.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  })()`
}

function elementPointScript(
  selector: string,
  frameSelector: string | undefined,
): string {
  return `(() => {
    const frame = ${frameSelector ? `document.querySelector(${JSON.stringify(frameSelector)})` : 'null'};
    const doc = frame ? frame.contentDocument : document;
    if (!doc) throw new Error('Cannot access frame document');
    const el = doc.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('No element matches selector: ${escapeForJs(selector)}');
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = el.getBoundingClientRect();
    const frameRect = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
    return {
      x: frameRect.left + rect.left + rect.width / 2,
      y: frameRect.top + rect.top + rect.height / 2,
      text: (el.innerText || el.textContent || '').trim(),
    };
  })()`
}

function focusScript(
  selector: string,
  frameSelector: string | undefined,
): string {
  return `(() => {
    const el = ${queryExpression(selector, frameSelector)};
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.focus();
    return true;
  })()`
}

function typeScript(
  selector: string,
  text: string,
  frameSelector: string | undefined,
): string {
  return `(() => {
    const el = ${queryExpression(selector, frameSelector)};
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.focus();
    el.value = ${JSON.stringify(text)};
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(text)} }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { typed: ${JSON.stringify(selector)}, value: el.value };
  })()`
}

function selectScript(
  selector: string,
  params: {
    value: string | undefined
    label: string | undefined
    index: number | undefined
    frameSelector: string | undefined
  },
): string {
  return `(() => {
    const el = ${queryExpression(selector, params.frameSelector)};
    if (!(el instanceof HTMLSelectElement)) throw new Error('Element is not a <select>: ${escapeForJs(selector)}');
    const options = Array.from(el.options);
    const option = ${params.value !== undefined ? `options.find((item) => item.value === ${JSON.stringify(params.value)})` : params.label !== undefined ? `options.find((item) => item.label === ${JSON.stringify(params.label)} || item.text === ${JSON.stringify(params.label)})` : params.index !== undefined ? `options[${params.index}]` : 'undefined'};
    if (!option) throw new Error('No matching option found');
    el.value = option.value;
    option.selected = true;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { selected: option.value, label: option.label || option.text };
  })()`
}

function scrollScript(params: {
  selector: string | undefined
  frameSelector: string | undefined
  axis: 'top' | 'left'
  delta: number
}): string {
  return `(() => {
    const target = ${params.selector ? queryExpression(params.selector, params.frameSelector) : params.frameSelector ? `document.querySelector(${JSON.stringify(params.frameSelector)}).contentWindow` : 'window'};
    if (!target) throw new Error('Scroll target not found');
    if (target.scrollBy) target.scrollBy({ ${params.axis}: ${params.delta}, behavior: 'instant' });
    else target.scroll${params.axis === 'top' ? 'Top' : 'Left'} += ${params.delta};
    return { scrollY: window.scrollY, scrollX: window.scrollX, targetScrollTop: target.scrollTop, targetScrollLeft: target.scrollLeft };
  })()`
}

function waitForScript(params: {
  selector: string | undefined
  text: string | undefined
  visible: boolean
  pollInterval: number
  timeout: number
  frameSelector: string | undefined
}): string {
  return `new Promise((resolve, reject) => {
    const started = Date.now();
    const getDoc = () => {
      const frame = ${params.frameSelector ? `document.querySelector(${JSON.stringify(params.frameSelector)})` : 'null'};
      return frame ? frame.contentDocument : document;
    };
    const check = () => {
      const doc = getDoc();
      if (!doc) return false;
      const selectorMatch = ${params.selector ? `(() => { const el = doc.querySelector(${JSON.stringify(params.selector)}); if (!el) return false; if (${params.visible}) { const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; } return true; })()` : 'true'};
      const textMatch = ${params.text ? `doc.body && doc.body.innerText.includes(${JSON.stringify(params.text)})` : 'true'};
      return selectorMatch && textMatch;
    };
    const tick = () => {
      if (check()) return resolve({ found: true, selector: ${JSON.stringify(params.selector)}, text: ${JSON.stringify(params.text)} });
      if (Date.now() - started >= ${params.timeout}) return reject(new Error('wait_for timed out after ${params.timeout}ms'));
      setTimeout(tick, ${params.pollInterval});
    };
    tick();
  })`
}

function storageScript(
  storage: 'local' | 'session',
  operation: 'get' | 'set' | 'remove' | 'clear',
  key: string | undefined,
  value: string | undefined,
): string {
  const storageName = storage === 'local' ? 'localStorage' : 'sessionStorage'
  return `(() => {
    const store = window.${storageName};
    if (${JSON.stringify(operation)} === 'get') {
      if (${JSON.stringify(key)} === undefined) return Object.fromEntries(Array.from({ length: store.length }, (_, i) => { const k = store.key(i); return [k, k ? store.getItem(k) : null]; }));
      return { key: ${JSON.stringify(key)}, value: store.getItem(${JSON.stringify(key ?? '')}) };
    }
    if (${JSON.stringify(operation)} === 'set') {
      store.setItem(${JSON.stringify(key ?? '')}, ${JSON.stringify(value ?? '')});
      return { key: ${JSON.stringify(key)}, value: ${JSON.stringify(value)} };
    }
    if (${JSON.stringify(operation)} === 'remove') {
      store.removeItem(${JSON.stringify(key ?? '')});
      return { removed: ${JSON.stringify(key)} };
    }
    store.clear();
    return { cleared: ${JSON.stringify(storage)} };
  })()`
}

function queryExpression(
  selector: string,
  frameSelector: string | undefined,
): string {
  return `(() => {
    const frame = ${frameSelector ? `document.querySelector(${JSON.stringify(frameSelector)})` : 'null'};
    const doc = frame ? frame.contentDocument : document;
    if (!doc) throw new Error('Cannot access frame document');
    const el = doc.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('No element matches selector: ${escapeForJs(selector)}');
    return el;
  })()`
}

function keyDefinition(key: string, text: string | undefined) {
  const named: Record<string, { key: string; code: string; keyCode: number }> =
    {
      Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
      Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
      Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
      Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
      Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
      ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
      ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
      ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
      ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    }
  const match = named[key]
  if (match) return { ...match, text: text ?? '' }
  const char = text ?? (key.length === 1 ? key : '')
  const code = key.length === 1 ? `Key${key.toUpperCase()}` : key
  return {
    key,
    code,
    keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    text: char,
  }
}

function modifierBitmask(
  modifiers: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>,
): number {
  let bitmask = 0
  if (modifiers.includes('Alt')) bitmask |= 1
  if (modifiers.includes('Control')) bitmask |= 2
  if (modifiers.includes('Meta')) bitmask |= 4
  if (modifiers.includes('Shift')) bitmask |= 8
  return bitmask
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

function buildApng(frames: Buffer[]): Buffer {
  if (frames.length === 0) return Buffer.alloc(0)
  const parsed = frames.map(parsePngChunks)
  const first = parsed[0]
  const ihdr = first.find((chunk) => chunk.type === 'IHDR')
  const iend = first.find((chunk) => chunk.type === 'IEND')
  if (!ihdr || !iend) return frames[0]
  const width = ihdr.data.readUInt32BE(0)
  const height = ihdr.data.readUInt32BE(4)
  const chunks: Buffer[] = [
    PNG_SIGNATURE,
    writePngChunk('IHDR', ihdr.data),
    writePngChunk('acTL', uint32Pair(frames.length, 0)),
  ]
  let sequence = 0
  parsed.forEach((frame, index) => {
    chunks.push(
      writePngChunk(
        'fcTL',
        frameControlData({
          sequenceNumber: sequence++,
          width,
          height,
          delayNum: 100,
          delayDen: 1000,
        }),
      ),
    )
    const imageData = Buffer.concat(
      frame.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data),
    )
    if (index === 0) {
      chunks.push(writePngChunk('IDAT', imageData))
    } else {
      chunks.push(
        writePngChunk('fdAT', Buffer.concat([uint32(sequence++), imageData])),
      )
    }
  })
  chunks.push(writePngChunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(chunks)
}

type PngChunk = { type: string; data: Buffer }

function parsePngChunks(buffer: Buffer): PngChunk[] {
  const chunks: PngChunk[] = []
  let offset = PNG_SIGNATURE.length
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    chunks.push({ type, data })
    offset += 12 + length
    if (type === 'IEND') break
  }
  return chunks
}

function writePngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  const output = Buffer.alloc(12 + data.length)
  output.writeUInt32BE(data.length, 0)
  typeBuffer.copy(output, 4)
  data.copy(output, 8)
  output.writeUInt32BE(
    crc32(Buffer.concat([typeBuffer, data])),
    8 + data.length,
  )
  return output
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value, 0)
  return buffer
}

function uint32Pair(first: number, second: number): Buffer {
  const buffer = Buffer.alloc(8)
  buffer.writeUInt32BE(first, 0)
  buffer.writeUInt32BE(second, 4)
  return buffer
}

function frameControlData(params: {
  sequenceNumber: number
  width: number
  height: number
  delayNum: number
  delayDen: number
}): Buffer {
  const buffer = Buffer.alloc(26)
  buffer.writeUInt32BE(params.sequenceNumber, 0)
  buffer.writeUInt32BE(params.width, 4)
  buffer.writeUInt32BE(params.height, 8)
  buffer.writeUInt32BE(0, 12)
  buffer.writeUInt32BE(0, 16)
  buffer.writeUInt16BE(params.delayNum, 20)
  buffer.writeUInt16BE(params.delayDen, 22)
  buffer.writeUInt8(0, 24)
  buffer.writeUInt8(0, 25)
  return buffer
}

function makeCrcTable(): number[] {
  const table: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
