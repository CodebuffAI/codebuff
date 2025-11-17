import { validateSingleAgent } from '@codebuff/common/templates/agent-validation'
import { userColumns } from '@codebuff/common/types/contracts/database'
import { DynamicAgentTemplateSchema } from '@codebuff/common/types/dynamic-agent-template'
import { getErrorObject } from '@codebuff/common/util/error'
import z from 'zod/v4'

import { WEBSITE_URL } from '../constants'

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

const userInfoCache: Record<
  string,
  Awaited<GetUserInfoFromApiKeyOutput<UserColumn>>
> = {}

const agentsResponseSchema = z.object({
  version: z.string(),
  data: DynamicAgentTemplateSchema,
})

export async function getUserInfoFromApiKey<T extends UserColumn>(
  params: GetUserInfoFromApiKeyInput<T>,
): GetUserInfoFromApiKeyOutput<T> {
  const { apiKey, fields, logger } = params

  if (apiKey in userInfoCache) {
    const userInfo = userInfoCache[apiKey]
    if (userInfo === null) {
      return userInfo
    }
    return Object.fromEntries(
      fields.map((field) => [field, userInfo[field]]),
    ) as {
      [K in (typeof fields)[number]]: (typeof userInfo)[K]
    }
  }

  const urlParams = new URLSearchParams({
    fields: userColumns.join(','),
  })
  const url = new URL(`/api/v1/me?${urlParams}`, WEBSITE_URL)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      logger.error(
        { apiKey, fields, response, status: response.status },
        'getUserInfoFromApiKey request failed',
      )
      // Throw specific error for authentication failures to distinguish from network errors
      if (response.status === 401 || response.status === 403) {
        const error = new Error('Authentication failed') as any
        error.code = 'AUTH_FAILED'
        error.status = response.status
        throw error
      }
      return null
    }

    userInfoCache[apiKey] = await response.json()
  } catch (error) {
    const errorObj = getErrorObject(error)

    // Check if this is an authentication error we threw
    if ((error as any)?.code === 'AUTH_FAILED') {
      throw error // Re-throw auth errors
    }

    // This is a network error (connection failed, timeout, etc.)
    logger.error(
      { error: errorObj, apiKey: apiKey.substring(0, 10) + '...', fields },
      'getUserInfoFromApiKey network error',
    )

    // Throw network error with specific code
    const networkError = new Error('Network error: Unable to reach server') as any
    networkError.code = 'NETWORK_ERROR'
    networkError.originalError = errorObj
    throw networkError
  }

  const userInfo = userInfoCache[apiKey]
  if (userInfo === null) {
    return userInfo
  }
  return Object.fromEntries(
    fields.map((field) => [field, userInfo[field]]),
  ) as {
    [K in (typeof fields)[number]]: (typeof userInfo)[K]
  }
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
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

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
    const errorObj = getErrorObject(error)
    logger.error(
      { error: errorObj, parsedAgentId },
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
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        action: 'START',
        agentId,
        ancestorRunIds,
      }),
    })

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
    const errorObj = getErrorObject(error)
    logger.error(
      { error: errorObj, agentId },
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
    const response = await fetch(url, {
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
    })

    if (!response.ok) {
      logger.error({ response }, 'finishAgentRun request failed')
      return
    }
  } catch (error) {
    const errorObj = getErrorObject(error)
    logger.error(
      { error: errorObj, runId, status },
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
    const response = await fetch(url, {
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
    })

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
    const errorObj = getErrorObject(error)
    logger.error(
      {
        error: errorObj,
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
