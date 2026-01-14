import { getClaudeOAuthCredentials, isClaudeOAuthValid } from '@codebuff/sdk'

import { useActivityQuery } from './use-activity-query'
import { logger as defaultLogger } from '../utils/logger'

import type { Logger } from '@codebuff/common/types/contracts/logger'

// Query keys for type-safe cache management
export const claudeQuotaQueryKeys = {
  all: ['claude-quota'] as const,
  current: () => [...claudeQuotaQueryKeys.all, 'current'] as const,
}

/**
 * Response from Anthropic OAuth usage endpoint
 */
export interface ClaudeQuotaWindow {
  utilization: number // Percentage used (0-100)
  resets_at: string | null // ISO timestamp when quota resets
}

export interface ClaudeQuotaResponse {
  five_hour: ClaudeQuotaWindow | null
  seven_day: ClaudeQuotaWindow | null
  seven_day_oauth_apps: ClaudeQuotaWindow | null
  seven_day_opus: ClaudeQuotaWindow | null
}

/**
 * Parsed quota data for display
 */
export interface ClaudeQuotaData {
  /** Remaining percentage for the 5-hour window (0-100) */
  fiveHourRemaining: number
  /** When the 5-hour quota resets */
  fiveHourResetsAt: Date | null
  /** Remaining percentage for the 7-day window (0-100) */
  sevenDayRemaining: number
  /** When the 7-day quota resets */
  sevenDayResetsAt: Date | null
}

/**
 * Fetches Claude OAuth usage data from Anthropic API
 */
export async function fetchClaudeQuota(
  accessToken: string,
  logger: Logger = defaultLogger,
): Promise<ClaudeQuotaData> {
  const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      // Required beta headers for OAuth endpoints (same as model requests)
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20,claude-code-20250219',
    },
  })

  if (!response.ok) {
    logger.debug(
      { status: response.status },
      'Failed to fetch Claude quota data',
    )
    throw new Error(`Failed to fetch Claude quota: ${response.status}`)
  }

  const responseBody = await response.json()
  const data = responseBody as ClaudeQuotaResponse

  // Parse the response into a more usable format
  const fiveHour = data.five_hour
  const sevenDay = data.seven_day

  return {
    fiveHourRemaining: fiveHour ? Math.max(0, 100 - fiveHour.utilization) : 100,
    fiveHourResetsAt: fiveHour?.resets_at ? new Date(fiveHour.resets_at) : null,
    sevenDayRemaining: sevenDay ? Math.max(0, 100 - sevenDay.utilization) : 100,
    sevenDayResetsAt: sevenDay?.resets_at ? new Date(sevenDay.resets_at) : null,
  }
}

export interface UseClaudeQuotaQueryDeps {
  logger?: Logger
  enabled?: boolean
  /** Refetch interval in milliseconds */
  refetchInterval?: number | false
  /** Refetch stale data when user becomes active after being idle */
  refetchOnActivity?: boolean
  /** Pause polling when user is idle */
  pauseWhenIdle?: boolean
  /** Time in ms to consider user idle (default: 30 seconds) */
  idleThreshold?: number
}

/**
 * Hook to fetch Claude OAuth quota data from Anthropic API
 * Only fetches when Claude OAuth is connected and valid
 * Uses the activity-aware query hook for terminal-specific optimizations
 */
export function useClaudeQuotaQuery(deps: UseClaudeQuotaQueryDeps = {}) {
  const {
    logger = defaultLogger,
    enabled = true,
    refetchInterval = 60 * 1000,
    refetchOnActivity = true,
    pauseWhenIdle = true,
    idleThreshold = 30_000,
  } = deps

  const isConnected = isClaudeOAuthValid()

  return useActivityQuery({
    queryKey: claudeQuotaQueryKeys.current(),
    queryFn: () => {
      // Get credentials inside queryFn to avoid stale closures
      const credentials = getClaudeOAuthCredentials()
      if (!credentials?.accessToken) {
        throw new Error('No Claude OAuth credentials')
      }
      return fetchClaudeQuota(credentials.accessToken, logger)
    },
    enabled: enabled && isConnected,
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1, // Only retry once on failure
    refetchOnMount: true,
    refetchInterval,
    refetchOnActivity,
    pauseWhenIdle,
    idleThreshold,
  })
}
