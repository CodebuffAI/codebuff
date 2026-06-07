import { WEBSITE_URL } from '@codebuff/sdk'

/**
 * API response types for consistent error handling.
 *
 * When `ok` is true, `data` may be undefined for responses with no body (e.g., 204 No Content).
 * Callers should check for `response.data` when they expect data from the endpoint.
 */
export type ApiResponse<T> =
  | { ok: true; status: number; data?: T }
  | {
      ok: false
      status: number
      error?: string
      errorData?: Record<string, unknown>
    }

export interface CodebuffApiClient {
  readonly baseUrl: string
  readonly authToken?: string

  /** Make a raw HTTP request */
  request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: Record<string, unknown>,
  ): Promise<ApiResponse<T>>

  /** Make a GET request */
  get<T>(path: string, options?: Record<string, unknown>): Promise<ApiResponse<T>>

  /** Make a POST request */
  post<T>(
    path: string,
    body?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<ApiResponse<T>>

  /** Make a PUT request */
  put<T>(
    path: string,
    body?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<ApiResponse<T>>

  /** Make a PATCH request */
  patch<T>(
    path: string,
    body?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<ApiResponse<T>>

  /** Make a DELETE request */
  delete<T>(path: string, options?: Record<string, unknown>): Promise<ApiResponse<T>>
}

// ============================================================================
// Local/BYOK mode does not need a cloud backend.
// The stub client always returns a no-op success response.
// ============================================================================

function createStubClient(baseUrl: string, authToken?: string): CodebuffApiClient {
  const stubOk = <T>(data?: T): ApiResponse<T> =>
    ({ ok: true, status: 200, data })

  const stubRequest = async <T>(
    _method: string,
    _path: string,
    _body?: unknown,
    _options?: Record<string, unknown>,
  ): Promise<ApiResponse<T>> => stubOk()

  return {
    baseUrl,
    authToken,
    request: stubRequest,
    get: <T>(_path: string, _options?: Record<string, unknown>) => stubRequest<T>('GET', _path),
    post: <T>(_path: string, _body?: Record<string, unknown>, _options?: Record<string, unknown>) =>
      stubRequest<T>('POST', _path),
    put: <T>(_path: string, _body?: Record<string, unknown>, _options?: Record<string, unknown>) =>
      stubRequest<T>('PUT', _path),
    patch: <T>(_path: string, _body?: Record<string, unknown>, _options?: Record<string, unknown>) =>
      stubRequest<T>('PATCH', _path),
    delete: <T>(_path: string, _options?: Record<string, unknown>) =>
      stubRequest<T>('DELETE', _path),
  }
}

// ============================================================================
// Shared singleton client
// ============================================================================

let sharedClient: CodebuffApiClient | null = null
let sharedAuthToken: string | undefined
let clientCreatedWithToken: string | undefined

/**
 * Get or create the shared API client singleton.
 * Returns a no-op stub in local/BYOK mode.
 *
 * Note: Always call setApiClientAuthToken() before getApiClient() when you need
 * to ensure a specific auth token is used. The client is recreated whenever
 * the auth token changes.
 */
export function getApiClient(): CodebuffApiClient {
  if (!sharedClient || clientCreatedWithToken !== sharedAuthToken) {
    sharedClient = createStubClient(WEBSITE_URL, sharedAuthToken)
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
}

/**
 * Reset the shared client (mainly for testing)
 */
export function resetApiClient(): void {
  sharedClient = null
  sharedAuthToken = undefined
  clientCreatedWithToken = undefined
}