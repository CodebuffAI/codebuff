import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'

import {
  type BrowserAction,
  BrowserActionInputSchema,
  BrowserActionSchema,
} from '@codebuff/common/browser-actions'

import {
  buildPdfAttachmentMetadata,
  frameSelectorOffsetScript,
  normalizeBrowserUrl,
  translateFramePoint,
} from '../tools/browser-logs'

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

  test('browser tool input schema is object-shaped for function calling', () => {
    const jsonSchema = z.toJSONSchema(BrowserActionInputSchema, { io: 'input' })

    expect(jsonSchema).toMatchObject({
      type: 'object',
      properties: {
        type: {
          type: 'string',
        },
      },
    })
    expect(jsonSchema).not.toHaveProperty('oneOf')
    expect(
      BrowserActionInputSchema.safeParse({ type: 'navigate' }).success,
    ).toBe(false)
    expect(
      BrowserActionInputSchema.safeParse({
        type: 'storage',
        storage: 'local',
        operation: 'remove',
        key: 'token',
      }).success,
    ).toBe(true)
  })

  test('accepts richer browser action schemas', () => {
    const actions = [
      { type: 'key', key: 'Enter' },
      { type: 'key', key: 'k', modifiers: ['Meta' as const] },
      { type: 'mouse', event: 'click', x: 10, y: 20 },
      { type: 'hover', selector: 'button[aria-label="Menu"]' },
      { type: 'drag', fromSelector: '#source', toSelector: '#target' },
      { type: 'select', selector: 'select[name="plan"]', value: 'pro' },
      { type: 'wait_for', selector: '[data-loaded="true"]', timeout: 5000 },
      { type: 'upload', selector: 'input[type="file"]', paths: ['README.md'] },
      { type: 'cookie', operation: 'set', name: 'token', value: 'abc' },
      { type: 'storage', storage: 'local', operation: 'set', key: 'token', value: 'abc' },
      { type: 'viewport', width: 390, height: 844, isMobile: true, hasTouch: true },
      { type: 'network', offline: false, latency: 100, downloadThroughput: 50_000 },
      { type: 'tab', operation: 'create', url: 'about:blank' },
      { type: 'recording', operation: 'start', everyNthFrame: 2 },
      { type: 'pdf', printBackground: true },
      { type: 'pixel_diff', expectedImageBase64: 'abc', threshold: 0.1 },
    ]

    for (const action of actions) {
      expect(BrowserActionSchema.parse(action).type).toBe(action.type as BrowserAction['type'])
    }
  })

  test('accepts iframe targeting on selector-based actions', () => {
    expect(
      BrowserActionSchema.parse({
        type: 'click',
        selector: 'button',
        frameSelector: 'iframe#checkout',
      }),
    ).toMatchObject({ type: 'click', frameSelector: 'iframe#checkout' })

    expect(
      BrowserActionSchema.parse({
        type: 'click',
        selector: 'button',
        frameUrl: '/embedded',
      }),
    ).toMatchObject({ type: 'click', frameUrl: '/embedded' })

    expect(
      BrowserActionSchema.parse({
        type: 'evaluate',
        script: 'document.body.innerText',
        frameUrl: '/embedded',
      }),
    ).toMatchObject({ type: 'evaluate', frameUrl: '/embedded' })

    expect(
      BrowserActionSchema.parse({
        type: 'mouse',
        event: 'click',
        x: 12,
        y: 34,
        frameSelector: 'iframe#checkout',
      }),
    ).toMatchObject({ type: 'mouse', frameSelector: 'iframe#checkout' })

    expect(
      BrowserActionSchema.parse({
        type: 'drag',
        fromX: 1,
        fromY: 2,
        toX: 3,
        toY: 4,
        frameUrl: '/embedded',
      }),
    ).toMatchObject({ type: 'drag', frameUrl: '/embedded' })
  })

  test('translates frame-local mouse coordinates to viewport coordinates', () => {
    const frameLocalClick = { x: 15, y: 25 }
    const frameOffset = { x: 100, y: 200 }

    expect(translateFramePoint(frameLocalClick, frameOffset)).toEqual({
      x: 115,
      y: 225,
    })
  })

  test('pdf metadata is JSON-only so unsupported PDF media does not break chat conversion', () => {
    const metadata = buildPdfAttachmentMetadata(Buffer.from('%PDF').toString('base64'))

    expect(metadata).toEqual({
      pdfAttached: true,
      pdfBase64Length: 8,
      pdfByteLength: 4,
    })
  })

  test('resolves frameSelector offsets for explicit coordinate actions', () => {
    const previousDocument = globalThis.document
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        querySelector: (selector: string) => {
          expect(selector).toBe('iframe#checkout')
          return { getBoundingClientRect: () => ({ left: 40, top: 60 }) }
        },
      },
    })

    try {
      const offset = Function(
        `return ${frameSelectorOffsetScript('iframe#checkout')}`,
      )()
      expect(translateFramePoint({ x: 12, y: 34 }, offset)).toEqual({
        x: 52,
        y: 94,
      })
    } finally {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument,
      })
    }
  })
})
