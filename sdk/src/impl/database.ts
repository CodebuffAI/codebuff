import { getErrorObject } from '@codebuff/common/util/error'

import { WEBSITE_URL } from '../constants'

import type {
  FetchAgentFromDatabaseFn,
  FinishAgentRunFn,
  GetUserInfoFromApiKeyInput,
  GetUserInfoFromApiKeyOutput,
  StartAgentRunFn,
  UserColumn,
} from '@codebuff/common/types/contracts/database'
import type { ParamsOf } from '@codebuff/common/types/function-params'

export async function getUserInfoFromApiKey<T extends UserColumn>(
  params: GetUserInfoFromApiKeyInput<T>,
): GetUserInfoFromApiKeyOutput<T> {
  const { apiKey, fields, logger } = params

  const urlParams = new URLSearchParams({ apiKey, fields: fields.join(',') })
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
        { apiKey, fields, response },
        'getUserInfoFromApiKey request failed',
      )
      return null
    }
    return response.json()
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), apiKey, fields },
      'getUserInfoFromApiKey error',
    )
    return null
  }
}

export async function fetchAgentFromDatabase(
  params: ParamsOf<FetchAgentFromDatabaseFn>,
): ReturnType<FetchAgentFromDatabaseFn> {
  const { apiKey, parsedAgentId, logger } = params
  const { publisherId, agentId, version } = parsedAgentId

  const url = new URL(
    `/api/v1/agents/${publisherId}/${agentId}/${version}`,
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
    return response.json()
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
    return response.json()
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
    logger.error(
      { error: getErrorObject(error), runId, status },
      'finishAgentRun error',
    )
  }
}

console.log(
  await finishAgentRun({
    apiKey: '12345',
    status: 'completed',
    totalSteps: 5,
    userId: undefined,
    runId: 'e7a129b2-feb5-40ac-b2cd-0d7c115962f5',
    directCredits: 12,
    totalCredits: 34,
    logger: console,
  }),
)
