import { getErrorObject } from '@codebuff/common/util/error'

import { WEBSITE_URL } from '../constants'

import type {
  FetchAgentFromDatabaseFn,
  GetUserInfoFromApiKeyInput,
  GetUserInfoFromApiKeyOutput,
  UserColumn,
} from '@codebuff/common/types/contracts/database'
import type { ParamsOf } from '@codebuff/common/types/function-params'

export async function getUserInfoFromApiKey<T extends UserColumn>(
  params: GetUserInfoFromApiKeyInput<T>,
): GetUserInfoFromApiKeyOutput<T> {
  const { apiKey, fields, logger } = params

  const urlParams = new URLSearchParams({ apiKey, fields: fields.join(',') })
  const url = new URL(`${WEBSITE_URL}/api/v1/me?${urlParams}`)

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
    `${WEBSITE_URL}/api/v1/agents/${publisherId}/${agentId}/${version}`,
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

console.log(
  await fetchAgentFromDatabase({
    apiKey: 'unused',
    parsedAgentId: {
      publisherId: 'codebuff',
      agentId: 'base',
      version: '0.0.1',
    },
    logger: console,
  }),
)
