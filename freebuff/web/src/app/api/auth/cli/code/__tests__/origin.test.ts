import { describe, expect, test } from 'bun:test'

import { getLoginUrlOrigin } from '../_origin'

describe('api/auth/cli/code/_origin', () => {
  test('uses the configured public app URL over the request origin', () => {
    const req = new Request('https://localhost:10000/api/auth/cli/code')

    expect(
      getLoginUrlOrigin(
        req,
        'https://freebuff.com',
        'https://freebuff.com',
        false,
      ),
    ).toBe('https://freebuff.com')
  })

  test('ignores a localhost configured URL in production', () => {
    const req = new Request('https://localhost:10000/api/auth/cli/code')

    expect(
      getLoginUrlOrigin(
        req,
        'https://localhost:10000',
        'https://freebuff.com',
        false,
      ),
    ).toBe('https://freebuff.com')
  })

  test('ignores IPv6 localhost in production', () => {
    const req = new Request('http://[::1]:3002/api/auth/cli/code')

    expect(
      getLoginUrlOrigin(
        req,
        'http://[::1]:3002',
        'https://freebuff.com',
        false,
      ),
    ).toBe('https://freebuff.com')
  })

  test('allows a localhost configured URL outside production', () => {
    const req = new Request('http://localhost:3002/api/auth/cli/code')

    expect(
      getLoginUrlOrigin(
        req,
        'http://localhost:3002',
        'https://freebuff.com',
        true,
      ),
    ).toBe('http://localhost:3002')
  })

  test('falls back to the request origin when configured URL is invalid', () => {
    const req = new Request('http://localhost:3002/api/auth/cli/code')

    expect(
      getLoginUrlOrigin(req, 'not a url', 'https://freebuff.com', true),
    ).toBe('http://localhost:3002')
  })
})
