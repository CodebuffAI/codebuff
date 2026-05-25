import { run } from '@codebuff/sdk'

import { bundledAgentDefinitions } from './bundled-agent-definitions'
import { postVlyRunEvent } from './callbacks'
import { buildVlyOverrideTools } from './vly-tool-bridge'

import type { VlyHarnessRunRequest, VlyRunEvent } from './types'

function installPromiseWithResolversPolyfill() {
  const promiseConstructor = Promise as unknown as {
    withResolvers?: <T>() => {
      promise: Promise<T>
      resolve: (value: T | PromiseLike<T>) => void
      reject: (reason?: unknown) => void
    }
  }

  if (promiseConstructor.withResolvers) {
    return
  }

  Object.defineProperty(promiseConstructor, 'withResolvers', {
    configurable: true,
    writable: true,
    value: <T>() => {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
      })

      return { promise, resolve, reject }
    },
  })
}

async function postRunEvent(params: {
  request: VlyHarnessRunRequest
  event: Omit<VlyRunEvent, 'runId' | 'projectId' | 'threadId' | 'messageId'>
  callbackSecret?: string
}) {
  await postVlyRunEvent({
    url: params.request.callbacks.eventUrl,
    bearerToken: params.request.callbacks.bearerToken,
    callbackSecret: params.callbackSecret,
    event: {
      runId: params.request.runId,
      projectId: params.request.projectId,
      threadId: params.request.threadId,
      messageId: params.request.messageId,
      ...params.event,
    },
  })
}

function createRunEventBuffer(params: {
  request: VlyHarnessRunRequest
  callbackSecret?: string
}) {
  type BufferedDelta = {
    type: 'text_delta' | 'reasoning_delta' | 'subagent_delta'
    chunk: string
    agentType?: string
  }

  let pending: BufferedDelta | undefined
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushPromise = Promise.resolve()

  const postBufferedDelta = async (event: BufferedDelta | undefined) => {
    if (!event?.chunk) {
      return
    }

    await postRunEvent({
      ...params,
      event,
    })
  }

  const takePending = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }
    const event = pending
    pending = undefined
    return event
  }

  const flushNow = async () => {
    await postBufferedDelta(takePending())
  }

  const enqueueFlush = () => {
    if (flushTimer) {
      return
    }
    flushTimer = setTimeout(() => {
      flushPromise = flushPromise.then(flushNow).catch((error) => {
        console.error('[vly-freebuff-harness] stream flush failed', error)
      })
    }, 150)
  }

  const append = (event: BufferedDelta) => {
    if (
      pending &&
      pending.type === event.type &&
      pending.agentType === event.agentType
    ) {
      pending.chunk += event.chunk
    } else {
      const previous = takePending()
      flushPromise = flushPromise.then(() => postBufferedDelta(previous))
      pending = event
    }
    enqueueFlush()
  }

  return {
    append,
    flush: async () => {
      await flushPromise
      await flushNow()
      await flushPromise
    },
  }
}

export async function runVlyFreebuffAgent(params: {
  request: VlyHarnessRunRequest
  codebuffApiKey: string
  callbackSecret?: string
}) {
  const { request, codebuffApiKey, callbackSecret } = params
  const eventBuffer = createRunEventBuffer({ request, callbackSecret })

  await postRunEvent({
    request,
    callbackSecret,
    event: { type: 'start' },
  })

  try {
    installPromiseWithResolversPolyfill()

    const runState = await run({
      apiKey: codebuffApiKey,
      fingerprintId: request.projectId,
      agent: request.agent,
      agentDefinitions: bundledAgentDefinitions,
      prompt: request.prompt,
      previousRun: request.previousRunState,
      costMode: 'normal',
      overrideTools: buildVlyOverrideTools({ request, callbackSecret }) as any,
      handleEvent: async (event: any) => {
        if (event.type === 'tool_call') {
          await eventBuffer.flush()
          await postRunEvent({
            request,
            callbackSecret,
            event: {
              type: 'status',
              title: event.toolName ?? 'Tool',
              content: 'Running tool',
            },
          })
        }
      },
      handleStreamChunk: async (chunk: any) => {
        if (typeof chunk === 'string') {
          eventBuffer.append({
            type: 'text_delta',
            chunk,
          })
        } else if (chunk.type === 'reasoning_chunk') {
          eventBuffer.append({
            type: 'reasoning_delta',
            chunk: chunk.chunk ?? '',
          })
        } else if (chunk.type === 'subagent_chunk') {
          eventBuffer.append({
            type: 'subagent_delta',
            agentType: chunk.agentType,
            chunk: chunk.chunk ?? '',
          })
        }
      },
    })

    await eventBuffer.flush()

    if (runState.output?.type === 'error') {
      await postRunEvent({
        request,
        callbackSecret,
        event: {
          type: 'error',
          message: runState.output.message,
        },
      })
      return
    }

    await eventBuffer.flush()
    await postRunEvent({
      request,
      callbackSecret,
      event: {
        type: 'final',
        runState,
      },
    })
  } catch (error) {
    await eventBuffer.flush()
    await postRunEvent({
      request,
      callbackSecret,
      event: {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }
}
