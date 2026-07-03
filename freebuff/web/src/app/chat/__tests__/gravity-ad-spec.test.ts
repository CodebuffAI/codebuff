import { describe, expect, it } from 'bun:test'

import {
  BUNDLED_FALLBACK_SPEC,
  interpolateText,
  parseRendererSpec,
  sanitizeUrl,
} from '../_components/gravity-ad-spec'

const validSpec = {
  version: 1,
  name: 'text-line',
  root: {
    type: 'link',
    style: { display: 'inline', fontSize: '14px' },
    children: [
      { type: 'text', text: '↗ ', style: { fontWeight: 600 } },
      { type: 'text', bind: 'title', style: { fontWeight: 500 } },
      { type: 'text', bind: 'cta' },
    ],
  },
}

describe('parseRendererSpec', () => {
  it('accepts the documented text-line spec', () => {
    const spec = parseRendererSpec(validSpec)
    expect(spec).not.toBeNull()
    expect(spec!.name).toBe('text-line')
    expect(spec!.root.type).toBe('link')
    expect(spec!.root.children).toHaveLength(3)
    expect(spec!.root.children![1].bind).toBe('title')
  })

  it('rejects non-objects and missing versions', () => {
    expect(parseRendererSpec(null)).toBeNull()
    expect(parseRendererSpec('spec')).toBeNull()
    expect(parseRendererSpec({ root: { type: 'box' } })).toBeNull()
  })

  it('rejects a spec containing an unknown node type', () => {
    expect(
      parseRendererSpec({
        version: 1,
        root: {
          type: 'box',
          children: [{ type: 'script', text: 'alert(1)' }],
        },
      }),
    ).toBeNull()
  })

  it('drops binds outside the allowed ad fields', () => {
    const spec = parseRendererSpec({
      version: 1,
      root: { type: 'text', bind: 'clickUrl' },
    })
    expect(spec).not.toBeNull()
    expect(spec!.root.bind).toBeUndefined()
  })

  it('strips dangerous style values but keeps safe ones', () => {
    const spec = parseRendererSpec({
      version: 1,
      root: {
        type: 'box',
        style: {
          color: 'hsl(var(--primary))',
          background: 'url(https://evil.example/pixel)',
          padding: 16,
        },
      },
    })
    expect(spec).not.toBeNull()
    expect(spec!.root.style).toEqual({
      color: 'hsl(var(--primary))',
      padding: 16,
    })
  })

  it('rejects specs beyond the depth cap', () => {
    let node: Record<string, unknown> = { type: 'text', text: 'deep' }
    for (let i = 0; i < 10; i++) {
      node = { type: 'box', children: [node] }
    }
    expect(parseRendererSpec({ version: 1, root: node })).toBeNull()
  })

  it('rejects specs beyond the node budget', () => {
    const children = Array.from({ length: 100 }, () => ({
      type: 'text',
      text: 'x',
    }))
    expect(
      parseRendererSpec({ version: 1, root: { type: 'box', children } }),
    ).toBeNull()
  })

  it('the bundled fallback passes its own validation', () => {
    expect(parseRendererSpec(BUNDLED_FALLBACK_SPEC)).not.toBeNull()
  })
})

describe('sanitizeUrl', () => {
  it('allows http(s) URLs only', () => {
    expect(sanitizeUrl('https://example.com/ad')).toBe('https://example.com/ad')
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com/')
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeUrl('data:text/html,<b>x</b>')).toBeNull()
    expect(sanitizeUrl('not a url')).toBeNull()
    expect(sanitizeUrl(undefined)).toBeNull()
  })
})

describe('interpolateText', () => {
  it('substitutes allowed ad fields and blanks missing ones', () => {
    const ad = { title: 'Great Tool', cta: 'Try it' }
    expect(interpolateText('{title} — {cta}', ad)).toBe('Great Tool — Try it')
    expect(interpolateText('{brandName}!', ad)).toBe('!')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(interpolateText('{impUrl}', { title: 't' })).toBe('{impUrl}')
  })
})
