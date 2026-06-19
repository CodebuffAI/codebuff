import { jsonToolResult } from '@codebuff/common/util/messages'

import { callGravityIndexAPI } from '../../../llm-api/codebuff-web-api'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { JSONObject, JSONValue } from '@codebuff/common/types/json'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const omitUndefined = (value: Record<string, JSONValue | undefined>) => {
  const result: JSONObject = {}
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) {
      result[key] = field
    }
  }
  return result
}

const isJSONObject = (value: JSONValue | undefined): value is JSONObject =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** Gravity attribution surface, so clicks/conversions are attributable to the
 *  product the request came from rather than all reading as CLI traffic. */
const gravitySurface = (agentTemplate: { id: string }): string => {
  if (agentTemplate.id === 'base-chat') return 'freebuff_chat'
  // Freebuff Web project agents are the `base2-free*` family.
  if (agentTemplate.id.startsWith('base2-free')) return 'freebuff_web'
  return 'codebuff_cli'
}

/** Surfaces that run under a shared service-account API key. For these we must
 *  send a per-end-user identifier so Gravity attributes conversions to the real
 *  user instead of collapsing every request onto the service account. */
const isServiceAccountSurface = (surface: string): boolean =>
  surface === 'freebuff_chat' || surface === 'freebuff_web'

export const handleGravityIndex = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'gravity_index'>
  agentTemplate: AgentTemplate
  logger: Logger
  apiKey: string

  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  repoId: string | undefined
  userInputId: string
  userId: string | undefined

  fetch: typeof globalThis.fetch
  clientEnv: ClientEnv
  ciEnv: CiEnv
}): Promise<{
  output: CodebuffToolOutput<'gravity_index'>
  creditsUsed: number
}> => {
  const {
    previousToolCallFinished,
    toolCall,
    agentTemplate,
    agentStepId,
    apiKey,
    clientSessionId,
    fingerprintId,
    logger,
    repoId,
    userId,
    userInputId,
    fetch,
    clientEnv,
    ciEnv,
  } = params
  const { action } = toolCall.input

  const startedAt = Date.now()
  const gravityContext = {
    toolCallId: toolCall.toolCallId,
    action,
    userId,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    repoId,
  }

  await previousToolCallFinished

  let creditsUsed = 0
  try {
    const existingInput = toolCall.input as JSONObject
    const existingMetadata = isJSONObject(existingInput.metadata)
      ? existingInput.metadata
      : {}
    const surface = gravitySurface(agentTemplate)
    const metadata = {
      ...existingMetadata,
      ...omitUndefined({
        surface,
        tool_call_id: toolCall.toolCallId,
        agent_step_id: agentStepId,
        fingerprint_id: fingerprintId,
        user_input_id: userInputId,
        repo_id: repoId,
      }),
    }
    const input = {
      ...existingInput,
      external_session_id: clientSessionId,
      // Shared service-account surfaces (Freebuff Web) authenticate the web API
      // with one account key, so the API-key owner can't identify the end user.
      // `fingerprintId` is the stable per-end-user/per-project signal there
      // (e.g. `freebuff-chat-<userId>` or the project id), so forward it as the
      // external user id; the web API hashes it before sending to Gravity. CLI
      // traffic omits it and falls back to the real API-key owner server-side.
      ...(isServiceAccountSurface(surface)
        ? { external_user_id: fingerprintId }
        : {}),
      metadata,
    } satisfies JSONObject

    const webApi = await callGravityIndexAPI({
      input,
      fetch,
      logger,
      apiKey,
      env: { clientEnv, ciEnv },
    })

    if (webApi.error || !webApi.result) {
      logger.warn(
        {
          ...gravityContext,
          durationMs: Date.now() - startedAt,
          success: false,
          error: webApi.error,
        },
        'Gravity Index returned error',
      )
      return {
        output: jsonToolResult({
          errorMessage: webApi.error ?? 'Invalid Gravity Index response',
        }),
        creditsUsed,
      }
    }

    if (typeof webApi.creditsUsed === 'number') {
      creditsUsed = webApi.creditsUsed
    }

    logger.info(
      {
        ...gravityContext,
        durationMs: Date.now() - startedAt,
        recommendation:
          typeof webApi.result.recommendation === 'object'
            ? webApi.result.recommendation
            : undefined,
        creditsUsed,
        success: true,
      },
      'Gravity Index request completed via web API',
    )

    return {
      output: jsonToolResult(webApi.result),
      creditsUsed,
    }
  } catch (error) {
    const errorMessage = `Error calling Gravity Index action "${action}": ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    logger.error(
      {
        ...gravityContext,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        durationMs: Date.now() - startedAt,
        success: false,
      },
      'Gravity Index request failed with error',
    )
    return { output: jsonToolResult({ errorMessage }), creditsUsed }
  }
}) satisfies CodebuffToolHandlerFunction<'gravity_index'>
