import { run } from '@codebuff/sdk'

import { postVlyRunEvent } from './callbacks'
import { buildVlyOverrideTools } from './vly-tool-bridge'

import type { VlyHarnessRunRequest, VlyRunEvent } from './types'

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

export async function runVlyFreebuffAgent(params: {
  request: VlyHarnessRunRequest
  codebuffApiKey: string
  callbackSecret?: string
}) {
  const { request, codebuffApiKey, callbackSecret } = params

  await postRunEvent({
    request,
    callbackSecret,
    event: { type: 'start' },
  })

  try {
    const runState = await run({
      apiKey: codebuffApiKey,
      fingerprintId: request.projectId,
      agent: request.agent,
      prompt: request.prompt,
      previousRun: request.previousRunState,
      costMode: 'normal',
      overrideTools: buildVlyOverrideTools({ request, callbackSecret }) as any,
      handleEvent: async (event: any) => {
        if (event.type === 'tool_call') {
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
          await postRunEvent({
            request,
            callbackSecret,
            event: { type: 'text_delta', chunk },
          })
        } else if (chunk.type === 'reasoning_chunk') {
          await postRunEvent({
            request,
            callbackSecret,
            event: {
              type: 'reasoning_delta',
              chunk: chunk.chunk ?? '',
            },
          })
        } else if (chunk.type === 'subagent_chunk') {
          await postRunEvent({
            request,
            callbackSecret,
            event: {
              type: 'subagent_delta',
              agentType: chunk.agentType,
              chunk: chunk.chunk ?? '',
            },
          })
        }
      },
    })

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

    await postRunEvent({
      request,
      callbackSecret,
      event: {
        type: 'final',
        runState,
      },
    })
  } catch (error) {
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
