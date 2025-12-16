import { PostHog } from 'posthog-node'

import type { AnalyticsEvent } from './constants/analytics-events'

/**
 * Shared analytics core module.
 * Provides common interfaces, types, and utilities used by both
 * server-side (common/src/analytics.ts) and CLI (cli/src/utils/analytics.ts) analytics.
 */

/** Interface for PostHog client methods used for event capture */
export interface AnalyticsClient {
  capture: (params: {
    distinctId: string
    event: string
    properties?: Record<string, any>
  }) => void
  flush: () => Promise<void>
}

/** Extended client interface with identify, alias, and exception capture (used by CLI) */
export interface AnalyticsClientWithIdentify extends AnalyticsClient {
  identify: (params: {
    distinctId: string
    properties?: Record<string, any>
  }) => void
  /** Links an alias (previous anonymous ID) to a distinctId (real user ID) */
  alias: (data: { distinctId: string; alias: string }) => void
  captureException: (
    error: any,
    distinctId: string,
    properties?: Record<string, any>,
  ) => void
}

/** Environment name type */
export type AnalyticsEnvName = 'dev' | 'test' | 'prod'

/** Base analytics configuration */
export interface AnalyticsConfig {
  envName: AnalyticsEnvName
  posthogApiKey: string
  posthogHostUrl: string
}

/** Options for creating a PostHog client */
export interface PostHogClientOptions {
  host: string
  flushAt?: number
  flushInterval?: number
  enableExceptionAutocapture?: boolean
}

/**
 * Default PostHog client factory.
 * Creates a real PostHog client instance.
 */
export function createPostHogClient(
  apiKey: string,
  options: PostHogClientOptions,
): AnalyticsClientWithIdentify {
  return new PostHog(apiKey, options) as AnalyticsClientWithIdentify
}

/**
 * Extracts analytics config from client environment variables.
 * Returns null if required env vars are missing.
 */
export function getConfigFromEnv(env: {
  NEXT_PUBLIC_CB_ENVIRONMENT?: string
  NEXT_PUBLIC_POSTHOG_API_KEY?: string
  NEXT_PUBLIC_POSTHOG_HOST_URL?: string
}): AnalyticsConfig | null {
  const envName = env.NEXT_PUBLIC_CB_ENVIRONMENT as AnalyticsEnvName | undefined
  const posthogApiKey = env.NEXT_PUBLIC_POSTHOG_API_KEY
  const posthogHostUrl = env.NEXT_PUBLIC_POSTHOG_HOST_URL

  if (!envName) return null
  if (!posthogApiKey || !posthogHostUrl) return null

  return { envName, posthogApiKey, posthogHostUrl }
}

/**
 * Checks if the environment is production.
 */
export function isProdEnv(envName: AnalyticsEnvName | undefined): boolean {
  return envName === 'prod'
}

/**
 * Generates a unique anonymous ID for pre-login tracking.
 * Uses crypto.randomUUID() for uniqueness.
 */
export function generateAnonymousId(): string {
  return `anon_${crypto.randomUUID()}`
}
