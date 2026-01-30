import { useActivityQuery } from './use-activity-query'
import { getAuthToken } from '../utils/auth'
import { getApiClient } from '../utils/codebuff-api'
import { logger as defaultLogger } from '../utils/logger'

import type { Logger } from '@codebuff/common/types/contracts/logger'

export const subscriptionQueryKeys = {
  all: ['subscription'] as const,
  current: () => [...subscriptionQueryKeys.all, 'current'] as const,
}

export interface SubscriptionRateLimit {
  limited: boolean
  reason?: 'block_exhausted' | 'weekly_limit'
  canStartNewBlock: boolean
  blockUsed?: number
  blockLimit?: number
  blockResetsAt?: string
  weeklyUsed: number
  weeklyLimit: number
  weeklyResetsAt: string
  weeklyPercentUsed: number
}

export interface SubscriptionInfo {
  status: string
  billingPeriodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  tier: number
}

export interface SubscriptionLimits {
  creditsPerBlock: number
  blockDurationHours: number
  weeklyCreditsLimit: number
}

export interface SubscriptionData {
  hasSubscription: boolean
  displayName?: string
  subscription?: SubscriptionInfo
  rateLimit?: SubscriptionRateLimit
  limits?: SubscriptionLimits
}

export async function fetchSubscriptionData(
  logger: Logger = defaultLogger,
): Promise<SubscriptionData> {
  const client = getApiClient()
  const response = await client.get<SubscriptionData>(
    '/api/user/subscription',
    { includeCookie: true },
  )

  if (!response.ok) {
    logger.debug(
      { status: response.status },
      'Failed to fetch subscription data',
    )
    throw new Error(`Failed to fetch subscription: ${response.status}`)
  }

  return response.data!
}

export interface UseSubscriptionQueryDeps {
  logger?: Logger
  enabled?: boolean
  refetchInterval?: number | false
  refetchOnActivity?: boolean
  pauseWhenIdle?: boolean
  idleThreshold?: number
}

export function useSubscriptionQuery(deps: UseSubscriptionQueryDeps = {}) {
  const {
    logger = defaultLogger,
    enabled = true,
    refetchInterval = 60 * 1000,
    refetchOnActivity = true,
    pauseWhenIdle = true,
    idleThreshold = 30_000,
  } = deps

  const authToken = getAuthToken()

  return useActivityQuery({
    queryKey: subscriptionQueryKeys.current(),
    queryFn: () => fetchSubscriptionData(logger),
    enabled: enabled && !!authToken,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnMount: true,
    refetchInterval,
    refetchOnActivity,
    pauseWhenIdle,
    idleThreshold,
  })
}
