import { describe, expect, test } from 'bun:test'

import { getLoginUrlOrigin } from '../_origin'

describe('api/auth/cli/code/_origin', () => {
  test('uses the configured public app URL over the request origin', () => {
    const req = new Request('https://localhost:10000/api/auth/cli/code')

    expect(
      getLoginUrlOrigin(
        req,
        'https://www.codebuff.com',
        'https://codebuff.com',
        false,
      ),
    ).toBe('https://www.codebuff.com')
  })

  test('ignores a localhost configured URL in production', () => {
    const req = new Request('https://localhost:10000/api/auth/cli/code')

    expect(
      getLoginUrlOrigin(
        req,
        'https://localhost:10000',
        'https://codebuff.com',
        false,
      ),
    ).toBe('https://codebuff.com')
  })

  test('ignores IPv6 localhost in production', () => {
    const req = new Request('http://[::1]:3000/api/auth/cli/code')

    expect(
      getLoginUrlOrigin(
        req,
        'http://[::1]:3000',
        'https://codebuff.com',
        false,
      ),
    ).toBe('https://codebuff.com')
  })

  test('allows a localhost configured URL outside production', () => {
    const req = new Request('http://localhost:3000/api/auth/cli/code')

    expect(
      getLoginUrlOrigin(
        req,
        'http://localhost:3000',
        'https://codebuff.com',
        true,
      ),
    ).toBe('http://localhost:3000')
  })

  test('falls back to the request origin when configured URL is invalid', () => {
    const req = new Request('http://localhost:3000/api/auth/cli/code')

    expect(
      getLoginUrlOrigin(req, 'not a url', 'https://codebuff.com', true),
    ).toBe('http://localhost:3000')
  })
})
