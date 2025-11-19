import { getUserInfoFromApiKey } from './database'
import {
  failureWithCode,
  type ExtendedErrorObject,
  type ErrorOr,
} from '@codebuff/common/util/error'
import type {
  GetUserInfoFromApiKeyInput,
  UserColumn,
} from '@codebuff/common/types/contracts/database'

type User = {
  id: string
  email: string
  discord_id: string | null
}

export type GetUserInfoFromApiKeySafeError = ExtendedErrorObject

export async function getUserInfoFromApiKeySafe<T extends UserColumn>(
  params: GetUserInfoFromApiKeyInput<T>,
): Promise<ErrorOr<{ [K in T]: User[K] } | null, GetUserInfoFromApiKeySafeError>> {
  try {
    const result = await getUserInfoFromApiKey<T>(params)
    return {
      success: true,
      value: result,
    }
  } catch (error) {
    return failureWithCode(error)
  }
}
