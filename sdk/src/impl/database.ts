import { getErrorObject } from '@codebuff/common/util/error'

import { WEBSITE_URL } from '../constants'

import type {
  GetUserInfoFromApiKeyInput,
  GetUserInfoFromApiKeyOutput,
  UserColumn,
} from '@codebuff/common/types/contracts/database'

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
