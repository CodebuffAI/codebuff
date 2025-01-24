import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import puppeteer, { Page, Browser, HTTPResponse } from 'puppeteer'
import { BrowserAction } from 'common/src/browser-actions'
import { handleBrowserInstruction } from '../tool-handlers'
import { browserSessions } from '../browser-runner'

// Mock puppeteer to avoid spawning real browsers
jest.mock('puppeteer', () => {
  // Create Page mock with proper return types
  const pageMock = {
    goto: jest.fn(() => Promise.resolve(null)),
    click: jest.fn(() => Promise.resolve()),
    type: jest.fn(() => Promise.resolve()),
    screenshot: jest.fn(() => Promise.resolve(Buffer.from('fake_screenshot'))),
    on: jest.fn(),
    waitForNavigation: jest.fn(() => Promise.resolve(null)),
    metrics: jest.fn(() => Promise.resolve({ JSHeapUsedSize: 123456 })),
    evaluate: jest.fn(() => Promise.resolve(JSON.stringify([{
      loadEventEnd: 1000,
      startTime: 0
    }])))
  } as unknown as Page

  // Create Browser mock with proper return types
  const browserMock = {
    pages: jest.fn(() => Promise.resolve([])),
    newPage: jest.fn(() => Promise.resolve(pageMock as Page)),
    close: jest.fn(() => Promise.resolve())
  } as unknown as Browser

  return {
    launch: jest.fn(() => Promise.resolve(browserMock)),
    __pageMock: pageMock,
    __browserMock: browserMock,
  }
})

describe('BrowserRunner Tests', () => {
  const browserId = 'mock-browser-id'

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset browser sessions between tests
    browserSessions.clear()
  })

  it('should start a browser and navigate on action.type = "start"', async () => {
    const action: BrowserAction = {
      type: 'start',
      url: 'https://example.com',
      headless: true,
      timeout: 15000
    }

    const response = await handleBrowserInstruction(action, browserId)

    const puppeteerModule: any = puppeteer
    const launchMock = puppeteerModule.launch
    const pageMock = puppeteerModule.__pageMock

    expect(launchMock).toHaveBeenCalledTimes(1)
    expect(launchMock).toHaveBeenCalledWith({
      headless: true,
      defaultViewport: { width: 1280, height: 800 },
    })
    expect(pageMock.goto).toHaveBeenCalledWith('https://example.com', {
      waitUntil: 'networkidle0',
      timeout: 15000,
    })
    expect(response.success).toBe(true)
    expect(response.logs).toEqual([])
  })

  it('should navigate to a new URL on action.type = "navigate"', async () => {
    // First start the browser
    await handleBrowserInstruction({
      type: 'start',
      url: 'https://example.com',
      headless: true,
      timeout: 15000
    }, browserId)

    const action: BrowserAction = {
      type: 'navigate',
      url: 'https://another-url.com',
      timeout: 15000,
      waitUntil: 'networkidle0'
    }
    const response = await handleBrowserInstruction(action, browserId)

    const puppeteerModule: any = puppeteer
    const pageMock = puppeteerModule.__pageMock

    expect(pageMock.goto).toHaveBeenCalledWith('https://another-url.com', {
      waitUntil: 'networkidle0',
      timeout: 15000,
    })
    expect(response.success).toBe(true)
  })

  it('should click on selector with action.type = "click"', async () => {
    await handleBrowserInstruction({
      type: 'start',
      url: 'https://example.com',
      headless: true,
      timeout: 15000
    }, browserId)

    const action: BrowserAction = {
      type: 'click',
      selector: '#login-button',
      waitForNavigation: true,
      timeout: 15000,
      button: 'left'
    }
    const response = await handleBrowserInstruction(action, browserId)

    const puppeteerModule: any = puppeteer
    const pageMock = puppeteerModule.__pageMock
    expect(pageMock.click).toHaveBeenCalledWith('#login-button', { button: 'left' })
    expect(pageMock.waitForNavigation).toHaveBeenCalledWith({
      waitUntil: 'networkidle0',
      timeout: 15000,
    })
    expect(response.success).toBe(true)
  })

  it('should type text in a selector with action.type = "type"', async () => {
    await handleBrowserInstruction({
      type: 'start',
      url: 'https://example.com',
      headless: true,
      timeout: 15000
    }, browserId)

    const action: BrowserAction = {
      type: 'type',
      selector: '#username',
      text: 'myUser',
      delay: 50
    }
    const response = await handleBrowserInstruction(action, browserId)

    const puppeteerModule: any = puppeteer
    const pageMock = puppeteerModule.__pageMock
    expect(pageMock.type).toHaveBeenCalledWith('#username', 'myUser', { delay: 50 })
    expect(response.success).toBe(true)
  })

  it('should take a screenshot with action.type = "screenshot"', async () => {
    await handleBrowserInstruction({
      type: 'start',
      url: 'https://example.com',
      headless: true,
      timeout: 15000
    }, browserId)

    const action: BrowserAction = {
      type: 'screenshot',
      fullPage: true,
      quality: 75
    }
    const response = await handleBrowserInstruction(action, browserId)

    expect(response.success).toBe(true)
    expect(response.screenshot).toBeDefined()
    expect(response.screenshot).toEqual('fake_screenshot')

    const puppeteerModule: any = puppeteer
    const pageMock = puppeteerModule.__pageMock
    expect(pageMock.screenshot).toHaveBeenCalledWith({
      fullPage: true,
      quality: 75,
      type: 'jpeg',
      encoding: 'binary',
    })
  })

  it('should close the browser with action.type = "stop"', async () => {
    await handleBrowserInstruction({
      type: 'start',
      url: 'https://example.com',
      headless: true,
      timeout: 15000
    }, browserId)

    const action: BrowserAction = { type: 'stop' }
    const response = await handleBrowserInstruction(action, browserId)

    expect(response.success).toBe(true)

    const puppeteerModule: any = puppeteer
    const browserMock = puppeteerModule.__browserMock
    expect(browserMock.close).toHaveBeenCalledTimes(1)
  })

  it('should handle errors and close browser on failure', async () => {
    const puppeteerModule: any = puppeteer
    const pageMock = puppeteerModule.__pageMock
    pageMock.goto.mockRejectedValueOnce(new Error('Navigation error!'))

    const action: BrowserAction = {
      type: 'start',
      url: 'https://example.com',
      headless: true,
      timeout: 15000
    }
    const response = await handleBrowserInstruction(action, browserId)
    expect(response.success).toBe(false)
    expect(response.error).toContain('Navigation error!')

    const browserMock = puppeteerModule.__browserMock
    expect(browserMock.close).toHaveBeenCalledTimes(1)
  })

  it('should collect metrics after actions', async () => {
    await handleBrowserInstruction({
      type: 'start',
      url: 'https://example.com',
      headless: true,
      timeout: 15000
    }, browserId)

    const action: BrowserAction = {
      type: 'navigate',
      url: 'https://example.com/page2',
      timeout: 15000,
      waitUntil: 'networkidle0'
    }
    const response = await handleBrowserInstruction(action, browserId)

    expect(response.metrics).toBeDefined()
    expect(response.metrics).toEqual({
      loadTime: 1000,
      memoryUsage: 123456,
      jsErrors: 0,
    })
  })
})
