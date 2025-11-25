import { env } from '@codebuff/common/env'
import { CREDITS_REFERRAL_BONUS } from '@codebuff/common/old-constants'

import { getAuthToken } from '../utils/auth'
import { getApiClient, setApiClientAuthToken } from '../utils/codebuff-api'
import { logger } from '../utils/logger'
import { getSystemMessage } from '../utils/message-history'

import type { PostUserMessageFn } from '../types/contracts/send-message'

export async function handleReferralCode(referralCode: string): Promise<{
  postUserMessage: PostUserMessageFn
}> {
  const authToken = getAuthToken()

  if (!authToken) {
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage(
        'Please log in first to redeem a referral code. Use /login to authenticate.',
      ),
    ]
    return { postUserMessage }
  }

  setApiClientAuthToken(authToken)
  const apiClient = getApiClient()

  try {
    const response = await apiClient.referral({ referralCode })

    if (!response.ok) {
      const errorMessage = response.error ?? 'Failed to redeem referral code'
      logger.error(
        {
          referralCode,
          error: errorMessage,
        },
        'Error redeeming referral code',
      )
      const postUserMessage: PostUserMessageFn = (prev) => [
        ...prev,
        getSystemMessage(`Error: ${errorMessage}`),
      ]
      return { postUserMessage }
    }

    const creditsRedeemed =
      response.data?.credits_redeemed ?? CREDITS_REFERRAL_BONUS
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage(
        `🎉 Noice, you've earned an extra ${creditsRedeemed} credits!\n\n` +
          `(pssst: you can also refer new users and earn ${CREDITS_REFERRAL_BONUS} credits for each referral at: ${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/referrals)`,
      ),
    ]
    return { postUserMessage }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(
      {
        referralCode,
        error: errorMessage,
      },
      'Error redeeming referral code',
    )
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage(`Error redeeming referral code: ${errorMessage}`),
    ]
    return { postUserMessage }
  }
}
