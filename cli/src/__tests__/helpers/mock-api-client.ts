import { mock } from 'bun:test'

import type { CodebirdsApiClient } from '../../utils/codebirds-api'

export interface MockApiClientOverrides {
  get?: ReturnType<typeof mock>
  post?: ReturnType<typeof mock>
  put?: ReturnType<typeof mock>
  patch?: ReturnType<typeof mock>
  delete?: ReturnType<typeof mock>
  request?: ReturnType<typeof mock>
  me?: ReturnType<typeof mock>
  usage?: ReturnType<typeof mock>
  loginCode?: ReturnType<typeof mock>
  loginStatus?: ReturnType<typeof mock>
  publish?: ReturnType<typeof mock>
  logout?: ReturnType<typeof mock>
  feedback?: ReturnType<typeof mock>
  baseUrl?: string
  authToken?: string
}

/**
 * Default OK response for mock API methods.
 * Returns { ok: true, status: 200 } without data, matching our ApiResponse type
 * where `data` is optional for responses without a body.
 */
const defaultOkResponse = () =>
  Promise.resolve({ ok: true as const, status: 200 })

/**
 * Creates a mock CodebirdsApiClient with sensible defaults.
 * All methods return { ok: true, status: 200 } by default.
 * Pass overrides to customize specific methods.
 */
export const createMockApiClient = (
  overrides: MockApiClientOverrides = {},
): CodebirdsApiClient => ({
  get: (overrides.get ?? mock(defaultOkResponse)) as CodebirdsApiClient['get'],
  post: (overrides.post ??
    mock(defaultOkResponse)) as CodebirdsApiClient['post'],
  put: (overrides.put ?? mock(defaultOkResponse)) as CodebirdsApiClient['put'],
  patch: (overrides.patch ??
    mock(defaultOkResponse)) as CodebirdsApiClient['patch'],
  delete: (overrides.delete ??
    mock(defaultOkResponse)) as CodebirdsApiClient['delete'],
  request: (overrides.request ??
    mock(defaultOkResponse)) as CodebirdsApiClient['request'],
  me: (overrides.me ?? mock(defaultOkResponse)) as CodebirdsApiClient['me'],
  usage: (overrides.usage ??
    mock(defaultOkResponse)) as CodebirdsApiClient['usage'],
  loginCode: (overrides.loginCode ??
    mock(defaultOkResponse)) as CodebirdsApiClient['loginCode'],
  loginStatus: (overrides.loginStatus ??
    mock(defaultOkResponse)) as CodebirdsApiClient['loginStatus'],
  publish: (overrides.publish ??
    mock(defaultOkResponse)) as CodebirdsApiClient['publish'],
  logout: (overrides.logout ??
    mock(defaultOkResponse)) as CodebirdsApiClient['logout'],
  feedback: (overrides.feedback ??
    mock(defaultOkResponse)) as CodebirdsApiClient['feedback'],
  baseUrl: overrides.baseUrl ?? 'https://test.codebirds.com',
  authToken: overrides.authToken,
})
