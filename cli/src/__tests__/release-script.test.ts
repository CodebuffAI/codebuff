import { describe, expect, test } from 'bun:test'

import {
  triggerWorkflow,
  validateVersionType,
} from '../../scripts/release'

describe('release workflow dispatch', () => {
  test('accepts only workflow-supported version types', () => {
    expect(validateVersionType('patch')).toBe('patch')
    expect(validateVersionType('minor')).toBe('minor')
    expect(validateVersionType('major')).toBe('major')
    expect(() => validateVersionType('1.2.3')).toThrow('Invalid release')
    expect(() => validateVersionType('patch; echo injected')).toThrow(
      'Invalid release',
    )
  })

  test('requires a successful dispatch and verifies the created run', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const createdAt = new Date().toISOString()
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (url.endsWith('/dispatches')) return new Response(null, { status: 204 })
      return Response.json({
        workflow_runs: [
          {
            id: 123,
            html_url: 'https://github.test/run/123',
            created_at: createdAt,
            event: 'workflow_dispatch',
            head_branch: 'main',
          },
        ],
      })
    }) as unknown as typeof fetch

    const result = await triggerWorkflow('patch', {
      token: 'secret-token',
      fetchImpl,
      verificationAttempts: 1,
    })

    expect(result).toEqual({
      runId: 123,
      htmlUrl: 'https://github.test/run/123',
    })
    expect(requests).toHaveLength(2)
    expect(requests[0].init?.body).toBe(
      JSON.stringify({ ref: 'main', inputs: { version_type: 'patch' } }),
    )
    expect(
      (requests[0].init?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer secret-token')
    expect(requests[0].url).not.toContain('secret-token')
    expect(String(requests[0].init?.body)).not.toContain('secret-token')
  })

  test('rejects non-2xx GitHub responses', async () => {
    const fetchImpl = (async () =>
      Response.json(
        { message: 'Bad credentials' },
        { status: 401 },
      )) as unknown as typeof fetch

    await expect(
      triggerWorkflow('patch', {
        token: 'bad-token',
        fetchImpl,
        verificationAttempts: 1,
      }),
    ).rejects.toThrow('HTTP 401')
  })

  test('does not report success when no workflow run can be verified', async () => {
    let requestCount = 0
    const fetchImpl = (async () => {
      requestCount++
      if (requestCount === 1) return new Response(null, { status: 204 })
      return Response.json({ workflow_runs: [] })
    }) as unknown as typeof fetch

    await expect(
      triggerWorkflow('patch', {
        token: 'token',
        fetchImpl,
        sleep: async () => {},
        verificationAttempts: 2,
      }),
    ).rejects.toThrow('no matching workflow run')
  })
})
