import { WEBSITE_URL } from '@codebuff/sdk'

import type {
  PublishAgentsResponse,
} from '@codebuff/common/types/api/agents/publish'
import type { FeedbackRequest } from '@codebuff/common/schemas/feedback'

/**
 * API response types for consistent error handling.
 *
 * When `ok` is true, `data` may be undefined for responses with no body (e.g., 204 No Content).
 * Callers should check for `response.data` when they expect data from the endpoint.
 */
export type ApiResponse<T> =
  | { ok: true; status: number; data?: T }
  | { ok: false; status: number; error?: string; errorData?: Record<string, unknown> }

// ============================================================================
// Type-safe endpoint request/response types
// ============================================================================

/** User fields that can be fetched from /api/v1/me */
export type UserField = 'id' | 'email' | 'discord_id'

export type UserDetails<T extends UserField = UserField> = {
  [K in T]: K extends 'discord_id' ? string | null : string
}

export interface UsageRequest {
  fingerprintId?: string
}

export interface UsageResponse {
  type: 'usage-response'
  usage: number
  remainingBalance: number | null
  balanceBreakdown?: Record<string, number>
  next_quota_reset: string | null
}

export interface LoginCodeRequest {
  fingerprintId: string
}

export interface LoginCodeResponse {
  loginUrl: string
  fingerprintHash: string
  expiresAt: string
}

export interface LoginStatusRequest {
  fingerprintId: string
  fingerprintHash: string
  expiresAt: string
}

export interface LoginStatusResponse {
  user?: Record<string, unknown>
}

export interface LogoutRequest {
  userId?: string
  fingerprintId?: string
  fingerprintHash?: string
}

export interface FeedbackResponse {
  success: boolean
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number
  /** Maximum delay in ms between retries (default: 10000) */
  maxDelayMs?: number
  /** HTTP status codes to retry on (default: [408, 429, 500, 502, 503, 504]) */
  retryableStatusCodes?: number[]
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
}

/**
 * Configuration for creating a Codebuff API client
 */
export interface CodebuffApiClientConfig {
  /** Base URL for API requests (defaults to WEBSITE_URL from SDK) */
  baseUrl?: string
  /** Auth token for Bearer authentication */
  authToken?: string
  /** Custom fetch implementation (for testing) */
  fetch?: typeof fetch
  /** Default timeout in ms for all requests (default: 30000) */
  defaultTimeoutMs?: number
  /** Default retry configuration */
  retry?: RetryConfig
  /**
   * Proxy URL to use for all requests.
   * If not set, falls back to HTTPS_PROXY / https_proxy / HTTP_PROXY / http_proxy
   * environment variables. Set to null to explicitly disable proxy even if env
   * vars are present.
   */
  proxy?: string | null
}

/**
 * Options for individual requests
 */
export interface RequestOptions {
  /** Query parameters to append to URL */
  query?: Record<string, string>
  /** Include Authorization header (default: true when authToken is set) */
  includeAuth?: boolean
  /** Include session token as Cookie header (for legacy endpoints) */
  includeCookie?: boolean
  /** Request timeout in ms (overrides default) */
  timeoutMs?: number
  /** Retry configuration (overrides default) */
  retry?: RetryConfig | false
  /** Custom headers */
  headers?: Record<string, string>
}

export interface CodebuffApiClient {
  readonly baseUrl: string
  readonly authToken?: string

  /** Make a raw HTTP request */
  request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>>

  /** Make a GET request */
  get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>>

  /** Make a POST request */
  post<T>(
    path: string,
    body?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>>

  /** Make a PUT request */
  put<T>(
    path: string,
    body?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>>

  /** Make a PATCH request */
  patch<T>(
    path: string,
    body?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>>

  /** Make a DELETE request */
  delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>>

  // ============================================================================
  // Type-safe endpoint methods
  // ============================================================================

  /** Fetch user details from /api/v1/me */
  me<T extends UserField>(
    fields: readonly T[],
  ): Promise<ApiResponse<UserDetails<T>>>

  /** Fetch usage data from /api/v1/usage */
  usage(req?: UsageRequest): Promise<ApiResponse<UsageResponse>>

  /** Request a login code from /api/auth/cli/code */
  loginCode(req: LoginCodeRequest): Promise<ApiResponse<LoginCodeResponse>>

  /** Check login status from /api/auth/cli/status */
  loginStatus(
    req: LoginStatusRequest,
  ): Promise<ApiResponse<LoginStatusResponse>>

  /** Publish agents via /api/agents/publish */
  publish(
    data: Record<string, unknown>[],
    allLocalAgentIds?: string[],
  ): Promise<ApiResponse<PublishAgentsResponse>>

  /** Logout via /api/auth/cli/logout */
  logout(req?: LogoutRequest): Promise<ApiResponse<void>>

  /** Submit feedback via /api/v1/feedback */
  feedback(req: FeedbackRequest): Promise<ApiResponse<FeedbackResponse>>
}

/**
 * Resolve the proxy URL from standard environment variables.
 * Priority: HTTPS_PROXY > https_proxy > HTTP_PROXY > http_proxy
 * Returns undefined when no proxy is configured.
 */
export function resolveProxyUrl(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return (
    env['HTTPS_PROXY'] ||
    env['https_proxy'] ||
    env['HTTP_PROXY'] ||
    env['http_proxy'] ||
    undefined
  )
}

/**
 * Sleep for a given duration
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Calculate delay with exponential backoff and jitter
 */
const calculateBackoffDelay = (
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number => {
  const exponentialDelay = initialDelayMs * Math.pow(2, attempt)
  const jitter = Math.random() * 0.3 * exponentialDelay // 0-30% jitter
  return Math.min(exponentialDelay + jitter, maxDelayMs)
}

/**
 * Check if an error is retryable (network errors).
 *
 * Note: AbortError is NOT retryable because it indicates intentional cancellation
 * (e.g., user cancelled the request or our timeout was exceeded).
 */
const isRetryableError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const name = error.name.toLowerCase()
    const message = error.message.toLowerCase()

    // Don't retry abort errors - they indicate intentional cancellation
    if (name === 'aborterror') {
      return false
    }

    return (
      name === 'timeouterror' ||
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('econnreset') ||
      message.includes('econnrefused')
    )
  }
  return false
}

/**
 * Create a Codebuff API client for making authenticated requests to the Codebuff API
 */
export function createCodebuffApiClient(
  config: CodebuffApiClientConfig = {},
): CodebuffApiClient {
  const {
    baseUrl = WEBSITE_URL,
    authToken,
    fetch: fetchFn = fetch,
    defaultTimeoutMs = 30000,
    retry: defaultRetryConfig = {},
    proxy: proxyConfig,
  } = config

  // Resolve proxy: explicit config wins, then env vars, then no proxy.
  // Pass proxy: null to explicitly disable even when env vars are set.
  const proxyUrl: string | undefined =
    proxyConfig === null
      ? undefined
      : (proxyConfig ?? resolveProxyUrl())

  const mergedDefaultRetry: Required<RetryConfig> = {
    ...DEFAULT_RETRY_CONFIG,
    ...defaultRetryConfig,
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const {
      query,
      includeAuth = true,
      includeCookie = false,
      timeoutMs = defaultTimeoutMs,
      retry: retryConfig = mergedDefaultRetry,
      headers: customHeaders = {},
    } = options

    // Build URL with query parameters
    let url = `${baseUrl}${path}`
    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams(query)
      url += `?${params.toString()}`
    }

    // Build headers
    const headers: Record<string, string> = { ...customHeaders }
    if (authToken && includeAuth) {
      headers['Authorization'] = `Bearer ${authToken}`
    }
    if (authToken && includeCookie) {
      headers['Cookie'] = `next-auth.session-token=${authToken};`
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
    }
    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body)
    }

    // Determine retry config
    const shouldRetry = retryConfig !== false
    const retryOpts = shouldRetry
      ? { ...mergedDefaultRetry, ...retryConfig }
      : null

    let lastError: unknown
    const maxAttempts = shouldRetry ? (retryOpts?.maxRetries ?? 0) + 1 : 1

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetchFn(url, {
          ...fetchOptions,
          signal: controller.signal,
          // Bun supports a `proxy` option on fetch. When a proxy URL is
          // resolved (from config or env vars) we pass it here so that all
          // API calls are tunnelled through the proxy. The cast is required
          // because the WhatWG RequestInit type does not include `proxy`.
          ...(proxyUrl ? { proxy: proxyUrl } : {}),
        } as RequestInit)

        clearTimeout(timeoutId)

        if (response.ok) {
          try {
            const responseBody = await response.json()
            const data = responseBody as T
            return { ok: true, status: response.status, data }
          } catch {
            // Response was OK but no JSON body (e.g., 204 No Content)
            return { ok: true, status: response.status }
          }
        }

        // Check if we should retry on this status code
        if (
          shouldRetry &&
          retryOpts &&
          retryOpts.retryableStatusCodes.includes(response.status) &&
          attempt < maxAttempts - 1
        ) {
          const delay = calculateBackoffDelay(
            attempt,
            retryOpts.initialDelayMs,
            retryOpts.maxDelayMs,
          )
          await sleep(delay)
          continue
        }

        // Parse error response
        let errorMessage: string | undefined
        let errorData: unknown
        try {
          const errorBody = await response.json()
          errorData = errorBody
          errorMessage =
            errorBody?.error || errorBody?.message || response.statusText
        } catch {
          try {
            errorMessage = await response.text()
          } catch {
            errorMessage = response.statusText
          }
        }

        return { ok: false, status: response.status, error: errorMessage, errorData: errorData as Record<string, unknown> | undefined }
      } catch (error) {
        clearTimeout(timeoutId)
        lastError = error

        // Check if we should retry on this error
        if (
          shouldRetry &&
          retryOpts &&
          isRetryableError(error) &&
          attempt < maxAttempts - 1
        ) {
          const delay = calculateBackoffDelay(
            attempt,
            retryOpts.initialDelayMs,
            retryOpts.maxDelayMs,
          )
          await sleep(delay)
          continue
        }

        // Don't retry, throw the error with URL context
        if (error instanceof Error) {
          const enhancedError = new Error(
            `${error.message} (${method} ${url})`,
          )
          enhancedError.name = error.name
          enhancedError.cause = error
          throw enhancedError
        }
        throw error
      }
    }

    // Should not reach here, but just in case
    throw lastError ?? new Error('Request failed after all retries')
  }

  return {
    baseUrl,
    authToken,
    request,

    get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
      return request<T>('GET', path, undefined, options)
    },

    post<T>(
      path: string,
      body?: Record<string, unknown>,
      options?: RequestOptions,
    ): Promise<ApiResponse<T>> {
      return request<T>('POST', path, body, options)
    },

    put<T>(
      path: string,
      body?: Record<string, unknown>,
      options?: RequestOptions,
    ): Promise<ApiResponse<T>> {
      return request<T>('PUT', path, body, options)
    },

    patch<T>(
      path: string,
      body?: Record<string, unknown>,
      options?: RequestOptions,
    ): Promise<ApiResponse<T>> {
      return request<T>('PATCH', path, body, options)
    },

    delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
      return request<T>('DELETE', path, undefined, options)
    },

    // ============================================================================
    // Type-safe endpoint methods
    // ============================================================================

    me<T extends UserField>(
      fields: readonly T[],
    ): Promise<ApiResponse<UserDetails<T>>> {
      return request<UserDetails<T>>('GET', '/api/v1/me', undefined, {
        query: { fields: fields.join(',') },
      })
    },

    usage(req: UsageRequest = {}): Promise<ApiResponse<UsageResponse>> {
      // Auth is sent via Authorization header (includeAuth defaults to true)
      return request<UsageResponse>('POST', '/api/v1/usage', {
        fingerprintId: req.fingerprintId ?? 'cli-usage',
      })
    },

    loginCode(req: LoginCodeRequest): Promise<ApiResponse<LoginCodeResponse>> {
      return request<LoginCodeResponse>(
        'POST',
        '/api/auth/cli/code',
        { fingerprintId: req.fingerprintId },
        { includeAuth: false },
      )
    },

    loginStatus(
      req: LoginStatusRequest,
    ): Promise<ApiResponse<LoginStatusResponse>> {
      return request<LoginStatusResponse>('GET', '/api/auth/cli/status', undefined, {
        query: {
          fingerprintId: req.fingerprintId,
          fingerprintHash: req.fingerprintHash,
          expiresAt: req.expiresAt,
        },
        includeAuth: false,
      })
    },

    publish(
      data: Record<string, unknown>[],
      allLocalAgentIds?: string[],
    ): Promise<ApiResponse<PublishAgentsResponse>> {
      // Auth is sent via Authorization header (includeAuth defaults to true)
      return request<PublishAgentsResponse>('POST', '/api/agents/publish', {
        data,
        allLocalAgentIds,
      })
    },

    logout(req: LogoutRequest = {}): Promise<ApiResponse<void>> {
      // Auth is sent via Authorization header (includeAuth defaults to true)
      return request<void>('POST', '/api/auth/cli/logout', {
        userId: req.userId,
        fingerprintId: req.fingerprintId,
        fingerprintHash: req.fingerprintHash,
      })
    },

    feedback(req: FeedbackRequest): Promise<ApiResponse<FeedbackResponse>> {
      return request<FeedbackResponse>('POST', '/api/v1/feedback', req, {
        // Feedback submissions are not idempotent server-side yet, so avoid automatic retries.
        retry: false,
      })
    },
  }
}

// ============================================================================
// Shared singleton client
// ============================================================================

let sharedClient: CodebuffApiClient | null = null
let sharedAuthToken: string | undefined
// Track the token that was used to create the current client instance
let clientCreatedWithToken: string | undefined

/**
 * Get or create the shared API client singleton.
 * The client is lazily created and reused across the application.
 *
 * Note: Always call setApiClientAuthToken() before getApiClient() when you need
 * to ensure a specific auth token is used. The client is recreated whenever
 * the auth token changes.
 */
export function getApiClient(): CodebuffApiClient {
  // Recreate client if it doesn't exist or if the token has changed since creation
  if (!sharedClient || clientCreatedWithToken !== sharedAuthToken) {
    sharedClient = createCodebuffApiClient({ authToken: sharedAuthToken })
    clientCreatedWithToken = sharedAuthToken
  }
  return sharedClient
}

/**
 * Set the auth token for the shared API client.
 * This will cause the next call to getApiClient() to create a new client
 * with the updated token.
 */
export function setApiClientAuthToken(authToken: string | undefined): void {
  sharedAuthToken = authToken
  // Note: We don't eagerly invalidate the client here. Instead, getApiClient()
  // checks if the token has changed and recreates the client if needed.
  // This avoids race conditions where the client is nullified but not yet recreated.
}

/**
 * Reset the shared client (mainly for testing)
 */
export function resetApiClient(): void {
  sharedClient = null
  sharedAuthToken = undefined
  clientCreatedWithToken = undefined
}
