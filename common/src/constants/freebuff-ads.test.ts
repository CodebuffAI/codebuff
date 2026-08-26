import { describe, expect, test } from 'bun:test'

import { normalizeUrlInput, platformForUrl } from './freebuff-ads'

// ---------------------------------------------------------------------------
// A pasted link, with the scheme people do not type
// ---------------------------------------------------------------------------
//
// Reported from a live signup: pressing Submit did nothing, with no alert, and
// the cause was a website typed without `https://`. The scheme was never
// carrying any meaning we did not already assume, so it is now optional
// everywhere a human types a URL.

describe('normalizeUrlInput', () => {
  test('prepends https to the way people actually paste links', () => {
    expect(normalizeUrlInput('x.com/you/status/123')).toBe(
      'https://x.com/you/status/123',
    )
    expect(normalizeUrlInput('www.acme.dev')).toBe('https://www.acme.dev')
    // whitespace from a copy is part of the same mistake
    expect(normalizeUrlInput('  acme.dev/blog  ')).toBe('https://acme.dev/blog')
  })

  test('leaves a URL that already has a scheme exactly as it is', () => {
    for (const url of [
      'https://x.com/a/status/1',
      'http://acme.dev',
      'HTTPS://ACME.DEV',
    ]) {
      expect(normalizeUrlInput(url)).toBe(url)
    }
  })

  // The important half: this forgives a MISSING scheme, and must never repair
  // a wrong one into something that looks acceptable.
  test('never invents a scheme for input that already names one', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'mailto:me@acme.dev',
      'data:text/html,<script>',
      'file:///etc/passwd',
      // parses as a scheme, which is why a naive try/catch would miss it
      'localhost:3000/admin',
    ]) {
      expect(normalizeUrlInput(hostile)).toBe(hostile)
      expect(platformForUrl(hostile)).toBeNull()
    }
  })

  test('empty input stays empty rather than becoming a bare https://', () => {
    expect(normalizeUrlInput('')).toBe('')
    expect(normalizeUrlInput('   ')).toBe('')
  })
})

describe('platformForUrl, on links typed without a scheme', () => {
  test('resolves the platform the reporter could not submit', () => {
    expect(platformForUrl('x.com/you/status/123')).toBe('twitter')
    expect(platformForUrl('www.reddit.com/r/webdev/comments/abc/title/')).toBe(
      'reddit',
    )
    expect(platformForUrl('linkedin.com/posts/someone_activity-123')).toBe(
      'linkedin',
    )
  })

  test('still refuses a host that is not a supported platform', () => {
    expect(platformForUrl('acme.dev/blog/post')).toBeNull()
    expect(platformForUrl('not a url at all')).toBeNull()
  })
})
