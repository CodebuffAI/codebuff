import { describe, it, expect } from '@jest/globals'
import { applyCacheHeaders } from '../apply-cache-headers'

describe('applyCacheHeaders', () => {
  it('sets expected cache and content headers', () => {
    const map = new Map<string, string>()
    const res = { headers: { set: (k: string, v: string) => map.set(k, v) } }

    const out = applyCacheHeaders(res)
    expect(out).toBe(res)
    expect(map.get('Cache-Control')).toContain('public')
    expect(map.get('Vary')).toBe('Accept-Encoding')
    expect(map.get('X-Content-Type-Options')).toBe('nosniff')
    expect(map.get('Content-Type')).toContain('application/json')
  })
})

