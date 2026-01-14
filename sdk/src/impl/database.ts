import { validateSingleAgent } from '@codebuff/common/templates/agent-validation'
import { DynamicAgentTemplateSchema } from '@codebuff/common/types/dynamic-agent-template'
import { getErrorObject } from '@codebuff/common/util/error'
import z from 'zod/v4'

import { WEBSITE_URL } from '../constants'
import {
  createAuthError,
  createNetworkError,
  createServerError,
  createHttpError,
  isRetryableStatusCode,
} from '../error-utils'
import {
  MAX_RETRIES_PER_MESSAGE,
  RETRY_BACKOFF_BASE_DELAY_MS,
  RETRY_BACKOFF_MAX_DELAY_MS,
} from '../retry-config'

import type {
  AddAgentStepFn,
  FetchAgentFromDatabaseFn,
  FinishAgentRunFn,
  GetUserInfoFromApiKeyInput,
  GetUserInfoFromApiKeyOutput,
  StartAgentRunFn,
  UserColumn,
} from '@codebuff/common/types/contracts/database'
import type { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import type { ParamsOf } from '@codebuff/common/types/function-params'

type CachedUserInfo = Partial<
  NonNullable<Awaited<GetUserInfoFromApiKeyOutput<UserColumn>>>
>

const userInfoCache: Record<
  string,
  CachedUserInfo | null
> = {}

const agentsResponseSchema = z.object({
  version: z.string(),
  data: DynamicAgentTemplateSchema,
})

/**
 * Fetch with retry logic for transient errors (502, 503, etc.)
 * Implements exponential backoff between retries.
 */
async function fetchWithRetry(
  url: URL | string,
  options: RequestInit,
  logger?: { warn: (obj: object, msg: string) => void },
): Promise<Response> {
  let lastError: Error | null = null
  let backoffDelay = RETRY_BACKOFF_BASE_DELAY_MS

  for (let attempt = 0; attempt <= MAX_RETRIES_PER_MESSAGE; attempt++) {
    try {
      const response = await fetch(url, options)

      // If response is OK or not retryable, return it
      if (response.ok || !isRetryableStatusCode(response.status)) {
        return response
      }

      // Retryable error - log and continue to retry
      if (attempt < MAX_RETRIES_PER_MESSAGE) {
        logger?.warn(
          { status: response.status, attempt: attempt + 1, url: String(url) },
          `Retryable HTTP error, retrying in ${backoffDelay}ms`,
        )
        await new Promise((resolve) => setTimeout(resolve, backoffDelay))
        backoffDelay = Math.min(backoffDelay * 2, RETRY_BACKOFF_MAX_DELAY_MS)
      } else {
        // Last attempt, return the response even if it's an error
        return response
      }
    } catch (error) {
      // Network-level error (DNS, connection refused, etc.)
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < MAX_RETRIES_PER_MESSAGE) {
        logger?.warn(
          { error: getErrorObject(lastError), attempt: attempt + 1, url: String(url) },
          `Network error, retrying in ${backoffDelay}ms`,
        )
        await new Promise((resolve) => setTimeout(resolve, backoffDelay))
        backoffDelay = Math.min(backoffDelay * 2, RETRY_BACKOFF_MAX_DELAY_MS)
      }
    }
  }

  // All retries exhausted - throw the last error
  throw lastError ?? new Error('Request failed after retries')
}

export async function getUserInfoFromApiKey<T extends UserColumn>(
  params: GetUserInfoFromApiKeyInput<T>,
): GetUserInfoFromApiKeyOutput<T> {
  const { apiKey, fields, logger } = params

  const cached = userInfoCache[apiKey]
  if (cached === null) {
    throw createAuthError()
  }
  if (
    cached &&
    fields.every((field) =>
      Object.prototype.hasOwnProperty.call(cached, field),
    )
  ) {
    return Object.fromEntries(fields.map((field) => [field, cached[field]])) as {
      [K in T]: CachedUserInfo[K]
    } as Awaited<GetUserInfoFromApiKeyOutput<T>>
  }

  const fieldsToFetch = cached
    ? fields.filter(
        (field) => !Object.prototype.hasOwnProperty.call(cached, field),
      )
    : fields

  const urlParams = new URLSearchParams({
    fields: fieldsToFetch.join(','),
  })
  const url = new URL(`/api/v1/me?${urlParams}`, WEBSITE_URL)

  let response: Response
  try {
    response = await fetchWithRetry(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      logger,
    )
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), apiKey, fields },
      'getUserInfoFromApiKey network error',
    )
    // Network-level failure: DNS, connection refused, timeout, etc.
    throw createNetworkError('Network request failed')
  }

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    logger.error(
      { apiKey, fields, status: response.status },
      'getUserInfoFromApiKey authentication failed',
    )
    // Don't cache auth failures - allow retry with potentially updated credentials
    delete userInfoCache[apiKey]
    // If the server returns 404 for invalid credentials, surface as 401 to callers
    const normalizedStatus = response.status === 404 ? 401 : response.status
    throw createHttpError('Authentication failed', normalizedStatus)
  }

  if (response.status >= 500 && response.status <= 599) {
    logger.error(
      { apiKey, fields, status: response.status },
      'getUserInfoFromApiKey server error',
    )
    throw createServerError('Server error', response.status)
  }

  if (!response.ok) {
    logger.error(
      { apiKey, fields, status: response.status },
      'getUserInfoFromApiKey request failed',
    )
    throw createHttpError('Request failed', response.status)
  }

  const cachedBeforeMerge = userInfoCache[apiKey]
  try {
    const responseBody = await response.json()
    const fetchedFields = responseBody as CachedUserInfo
    userInfoCache[apiKey] = {
      ...(cachedBeforeMerge ?? {}),
      ...fetchedFields,
    }
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), apiKey, fields },
      'getUserInfoFromApiKey JSON parse error',
    )
    throw createHttpError('Failed to parse response', response.status)
  }

  const userInfo = userInfoCache[apiKey]
  if (userInfo === null) {
    throw createAuthError()
  }
  if (
    !userInfo ||
    !fields.every((field) =>
      Object.prototype.hasOwnProperty.call(userInfo, field),
    )
  ) {
    logger.error(
      { apiKey, fields },
      'getUserInfoFromApiKey: response missing required fields',
    )
    throw createHttpError('Request failed', response.status)
  }
  return Object.fromEntries(
    fields.map((field) => [field, userInfo[field]]),
  ) as Awaited<GetUserInfoFromApiKeyOutput<T>>
}

export async function fetchAgentFromDatabase(
  params: ParamsOf<FetchAgentFromDatabaseFn>,
): ReturnType<FetchAgentFromDatabaseFn> {
  const { apiKey, parsedAgentId, logger } = params
  const { publisherId, agentId, version } = parsedAgentId

  const url = new URL(
    `/api/v1/agents/${publisherId}/${agentId}/${version ? version : 'latest'}`,
    WEBSITE_URL,
  )

  try {
    const response = await fetchWithRetry(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      logger,
    )

    if (!response.ok) {
      logger.error({ response }, 'fetchAgentFromDatabase request failed')
      return null
    }

    const responseJson = await response.json()
    const parseResult = agentsResponseSchema.safeParse(responseJson)
    if (!parseResult.success) {
      logger.error(
        { responseJson, parseResult },
        `fetchAgentFromDatabase parse error`,
      )
      return null
    }

    const agentConfig = parseResult.data
    const rawAgentData = agentConfig.data as DynamicAgentTemplate

    // Validate the raw agent data with the original agentId (not full identifier)
    const validationResult = validateSingleAgent({
      template: { ...rawAgentData, id: agentId, version: agentConfig.version },
      filePath: `${publisherId}/${agentId}@${agentConfig.version}`,
    })

    if (!validationResult.success) {
      logger.error(
        {
          publisherId,
          agentId,
          version: agentConfig.version,
          error: validationResult.error,
        },
        'fetchAgentFromDatabase: Agent validation failed',
      )
      return null
    }

    // Set the correct full agent ID for the final template
    const agentTemplate = {
      ...validationResult.agentTemplate!,
      id: `${publisherId}/${agentId}@${agentConfig.version}`,
    }

    logger.debug(
      {
        publisherId,
        agentId,
        version: agentConfig.version,
        fullAgentId: agentTemplate.id,
        parsedAgentId,
      },
      'fetchAgentFromDatabase: Successfully loaded and validated agent from database',
    )

    return agentTemplate
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), parsedAgentId },
      'fetchAgentFromDatabase error',
    )
    return null
  }
}

export async function startAgentRun(
  params: ParamsOf<StartAgentRunFn>,
): ReturnType<StartAgentRunFn> {
  const { apiKey, agentId, ancestorRunIds, logger } = params

  const url = new URL(`/api/v1/agent-runs`, WEBSITE_URL)

  try {
    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          action: 'START',
          agentId,
          ancestorRunIds,
        }),
      },
      logger,
    )

    if (!response.ok) {
      logger.error({ response }, 'startAgentRun request failed')
      return null
    }

    const responseBody = await response.json()
    if (!responseBody?.runId) {
      logger.error(
        { responseBody },
        'no runId found from startAgentRun request',
      )
    }
    return responseBody?.runId ?? null
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), agentId },
      'startAgentRun error',
    )
    return null
  }
}

export async function finishAgentRun(
  params: ParamsOf<FinishAgentRunFn>,
): ReturnType<FinishAgentRunFn> {
  const {
    apiKey,
    runId,
    status,
    totalSteps,
    directCredits,
    totalCredits,
    logger,
  } = params

  const url = new URL(`/api/v1/agent-runs`, WEBSITE_URL)

  try {
    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          action: 'FINISH',
          runId,
          status,
          totalSteps,
          directCredits,
          totalCredits,
        }),
      },
      logger,
    )

    if (!response.ok) {
      logger.error({ response }, 'finishAgentRun request failed')
      return
    }
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), runId, status },
      'finishAgentRun error',
    )
  }
}

export async function addAgentStep(
  params: ParamsOf<AddAgentStepFn>,
): ReturnType<AddAgentStepFn> {
  const {
    apiKey,
    agentRunId,
    stepNumber,
    credits,
    childRunIds,
    messageId,
    status = 'completed',
    errorMessage,
    startTime,
    logger,
  } = params

  const url = new URL(`/api/v1/agent-runs/${agentRunId}/steps`, WEBSITE_URL)

  try {
    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          stepNumber,
          credits,
          childRunIds,
          messageId,
          status,
          errorMessage,
          startTime,
        }),
      },
      logger,
    )

    const responseBody = await response.json()
    if (!response.ok) {
      logger.error({ responseBody }, 'addAgentStep request failed')
      return null
    }

    if (!responseBody?.stepId) {
      logger.error(
        { responseBody },
        'no stepId found from addAgentStep request',
      )
    }
    return responseBody.stepId ?? null
  } catch (error) {
    logger.error(
      {
        error: getErrorObject(error),
        agentRunId,
        stepNumber,
        credits,
        childRunIds,
        messageId,
        status,
        errorMessage,
        startTime,
      },
      'addAgentStep error',
    )
    return null
  }
}
