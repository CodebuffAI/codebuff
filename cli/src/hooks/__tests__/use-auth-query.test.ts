import { describe, expect, test } from 'bun:test'

import { authQueryKeys } from '../use-auth-query'

describe('authQueryKeys.validation', () => {
  test('changes when api key changes', () => {
    const firstKey = authQueryKeys.validation('token-1')
    const secondKey = authQueryKeys.validation('token-2')

    expect(firstKey).not.toEqual(secondKey)
  })

  test('does not include the raw api key', () => {
    const token = 'secret-token-123'
    const key = authQueryKeys.validation(token)
    const [, , apiKeyHash] = key

    expect(key).not.toContain(token)
    expect(apiKeyHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

