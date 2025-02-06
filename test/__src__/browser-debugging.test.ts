import { test, expect, beforeEach, mock, describe } from 'bun:test'
import { BrowserRunner } from '../../npm-app/src/browser-runner'
import {
  BrowserAction,
  createBrowserActionXML,
  parseBrowserActionXML,
} from '../../common/src/browser-actions'

// Mock puppeteer
mock.module('puppeteer', () => ({
  default: {
    launch: () => ({
      pages: () => [],
      newPage: () => ({
        goto: () => Promise.resolve(),
        on: () => {},
        evaluate: () => Promise.resolve({}),
        metrics: () => Promise.resolve({ JSHeapUsedSize: 1000 }),
      }),
      close: () => Promise.resolve(),
    }),
  },
}))

describe('Browser XML Instructions', () => {
  test('creates valid XML from browser action', () => {
    const action: BrowserAction = {
      type: 'start',
      url: 'https://example.com',
      headless: true,
      timeout: 15000,
    }

    const xml = createBrowserActionXML(action)
    expect(xml).toContain('<browser_action')
    expect(xml).toContain('action="start"')
    expect(xml).toContain('url="https://example.com"')
    expect(xml).toContain('headless="true"')
    expect(xml).toContain('timeout="15000"')
    expect(xml).toContain('/>')
  })

  test('escapes special characters in XML', () => {
    const action: BrowserAction = {
      type: 'click',
      selector: 'button[data-test="test & demo"]',
    }

    const xml = createBrowserActionXML(action)
    expect(xml).toContain(
      'selector="button[data-test=&quot;test &amp; demo&quot;]"'
    )
  })

  test('parses XML back into browser action', () => {
    const original: BrowserAction = {
      type: 'start',
      url: 'https://example.com',
      headless: true,
      timeout: 15000,
    }

    const xml = createBrowserActionXML(original)
    const parsed = parseBrowserActionXML(xml)

    expect(parsed).toEqual(original)
  })

  test('handles complex objects in attributes', () => {
    const action: BrowserAction = {
      type: 'start',
      url: 'https://example.com',
      retryOptions: {
        maxRetries: 3,
        retryDelay: 1000,
        retryOnErrors: ['TimeoutError'],
      },
    }

    const xml = createBrowserActionXML(action)
    const parsed = parseBrowserActionXML(xml)

    expect(parsed).toEqual(action)
  })

  test('throws error on invalid XML', () => {
    const invalidXml = '<browser_action type="click" >'
    expect(() => parseBrowserActionXML(invalidXml)).toThrow()
  })

  test('ignores undefined and null values', () => {
    const action: BrowserAction = {
      type: 'start',
      url: 'https://example.com',
      headless: undefined,
      timeout: null as any,
    }

    const xml = createBrowserActionXML(action)
    expect(xml).not.toContain('headless')
    expect(xml).not.toContain('timeout')
  })

  test('handles all browser action types', () => {
    const actions: BrowserAction[] = [
      { type: 'start', url: 'https://example.com' },
      { type: 'navigate', url: 'https://example.com/page2' },
      { type: 'click', selector: '#button' },
      { type: 'type', selector: '#input', text: 'Hello' },
      { type: 'screenshot' },
      { type: 'stop' },
    ]

    for (const action of actions) {
      const xml = createBrowserActionXML(action)
      const parsed = parseBrowserActionXML(xml)
      expect(parsed).toEqual(action)
    }
  })
})

describe('BrowserRunner Advanced Features', () => {
  let runner: BrowserRunner

  beforeEach(() => {
    runner = new BrowserRunner()
  })

  test('session timeout triggers shutdown', async () => {
    const startAction: BrowserAction = {
      type: 'start',
      url: 'https://example.com',
      sessionTimeoutMs: 1, // 1ms timeout for testing
    }

    await runner.execute(startAction)

    // Wait to ensure timeout
    await new Promise((res) => setTimeout(res, 50))

    const navigateAction: BrowserAction = {
      type: 'navigate',
      url: 'https://example.com/page2',
    }

    const result = await runner.execute(navigateAction)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/time limit/)
  })

  test('consecutive errors trigger shutdown', async () => {
    const startAction: BrowserAction = {
      type: 'start',
      url: 'https://example.com',
      maxConsecutiveErrors: 2,
    }

    await runner.execute(startAction)

    // Mock an action that always fails
    const failingAction: BrowserAction = {
      type: 'click',
      selector: '#non-existent',
    }

    // First failure
    let result = await runner.execute(failingAction)
    expect(result.success).toBe(false)

    // Second failure should trigger shutdown
    result = await runner.execute(failingAction)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/consecutive errors/)
  })

  test('debug mode logs additional information', async () => {
    const startAction: BrowserAction = {
      type: 'start',
      url: 'https://example.com',
      debug: true,
    }

    const result = await runner.execute(startAction)
    expect(result.success).toBe(true)

    const debugLogs = result.logs.filter((log) => log.type === 'debug')
    expect(debugLogs.length).toBeGreaterThan(0)
  })
})
