import { describe, expect, test } from 'bun:test'

import { normalizeBrowserUrl } from '../tools/browser-logs'

describe('browser_logs', () => {
  test('normalizes bare live domains to HTTPS', () => {
    expect(normalizeBrowserUrl('infraformat.com')).toBe(
      'https://infraformat.com',
    )
    expect(normalizeBrowserUrl('www.infraformat.com/path?q=1')).toBe(
      'https://www.infraformat.com/path?q=1',
    )
  })

  test('preserves explicit schemes and local dev HTTP defaults', () => {
    expect(normalizeBrowserUrl('https://infraformat.com')).toBe(
      'https://infraformat.com',
    )
    expect(normalizeBrowserUrl('http://localhost:5173')).toBe(
      'http://localhost:5173',
    )
    expect(normalizeBrowserUrl('about:blank')).toBe('about:blank')
    expect(normalizeBrowserUrl('data:text/html,<h1>Smoke</h1>')).toBe(
      'data:text/html,<h1>Smoke</h1>',
    )
    expect(normalizeBrowserUrl('localhost:5173')).toBe('http://localhost:5173')
    expect(normalizeBrowserUrl('127.0.0.1:3001')).toBe(
      'http://127.0.0.1:3001',
    )
  })
})
