import * as fs from 'fs'
import * as path from 'path'

import { BROWSER_DEFAULTS } from '@codebuff/common/browser-actions'
import { ensureDirectoryExists } from '@codebuff/common/util/file'
import { sleep } from '@codebuff/common/util/promise'
import { ensureUrlProtocol } from '@codebuff/common/util/string'
import puppeteer from 'puppeteer-core'

import { getCurrentChatDir } from './project-files'
import { logger } from './utils/logger'

import type {
  BrowserAction,
  BrowserConfig,
  BrowserResponse,
} from '@codebuff/common/browser-actions'
import type { Browser, HTTPRequest, HTTPResponse, Page } from 'puppeteer-core'

type NonOptional<T, K extends keyof T> = T & { [P in K]-?: T[P] }

export class BrowserRunner {
  // Add getter methods for diagnostic loop
  getLogs(): BrowserResponse['logs'] {
    return this.logs
  }

  getNetworkEvents(): BrowserResponse['networkEvents'] {
    return this.networkEvents
  }
  private browser: Browser | null = null
  private page: Page | null = null
  private logs: BrowserResponse['logs'] = []
  private jsErrorCount = 0
  private retryCount = 0
  private startTime: number = 0

  // Error tracking
  private consecutiveErrors = 0
  private totalErrors = 0

  constructor() {}

  // Error tracking configuration
  private maxConsecutiveErrors = 3
  private totalErrorThreshold = 10
  private performanceMetrics: {
    ttfb?: number
    lcp?: number
    fcp?: number
    domContentLoaded?: number
  } = {}
  private networkEvents: Array<{
    url: string
    method: string
    status?: number
    errorText?: string
    timestamp: number
  }> = []

  private async executeWithRetry(
    action: BrowserAction,
  ): Promise<BrowserResponse> {
    const retryOptions = action.retryOptions ?? BROWSER_DEFAULTS.retryOptions
    let lastError: Error | null = null

    for (
      let attempt = 0;
      attempt <= (retryOptions.maxRetries ?? 3);
      attempt++
    ) {
      try {
        const result = await this.executeAction(action)
        // Reset consecutive errors on success
        this.consecutiveErrors = 0
        return result
      } catch (error: any) {
        // Track errors
        this.consecutiveErrors++
        this.totalErrors++

        // Log error analysis
        this.logErrorForAnalysis(error)

        // Check error thresholds
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          const msg = `Max consecutive errors reached (${this.maxConsecutiveErrors}).`
          this.logs.push({
            type: 'error',
            message: msg,
            timestamp: Date.now(),
            source: 'tool',
          })
          await this.shutdown()
          return {
            success: false,
            error: msg,
            logs: this.logs,
          }
        }

        if (this.totalErrors >= this.totalErrorThreshold) {
          const msg = `Total error threshold reached (${this.totalErrorThreshold}).`
          this.logs.push({
            type: 'error',
            message: msg,
            timestamp: Date.now(),
            source: 'tool',
          })
          await this.shutdown()
          return {
            success: false,
            error: msg,
            logs: this.logs,
          }
        }
        lastError = error
        const shouldRetry = retryOptions.retryOnErrors?.includes(error.name)
        if (!shouldRetry || attempt === retryOptions.maxRetries) {
          throw error
        }
        await new Promise((resolve) =>
          setTimeout(resolve, retryOptions.retryDelay ?? 1000),
        )
        this.logs.push({
          type: 'info',
          message: `Retrying action (attempt ${attempt + 1}/${retryOptions.maxRetries})`,
          timestamp: Date.now(),
          category: 'retry',
          source: 'tool',
        })
      }
    }
    throw lastError
  }

  private async executeAction(action: BrowserAction): Promise<BrowserResponse> {
    try {
      // Only take pre-action screenshot if browser is already running
      let preActionResult = null
      if (this.browser && this.page) {
        // preActionResult = await this.takeScreenshot(
        //   {
        //     type: 'screenshot',
        //   },
        //   this.page
        // )
      }

      let response: BrowserResponse
      switch (action.type) {
        case 'start':
          await this.getBrowser(action)
          if (!action.url) {
            break
          }
        case 'navigate':
          response = await this.navigate({ ...action, type: 'navigate' })
          break
        case 'click':
          console.log('Clicking has not been implemented yet')
          break
        case 'type':
          await this.typeText(action)
          break
        case 'scroll':
          await this.scroll(action)
          break
        case 'screenshot':
          break
        case 'stop':
          await this.shutdown()
          return {
            success: true,
            logs: this.logs,
            metrics: await this.collectMetrics(),
          }
        default:
          throw new Error(
            `Unknown action type: ${(action as BrowserAction).type}`,
          )
      }

      // Take post-action screenshot
      let postActionResult = null
      if (this.page) {
        // postActionResult = await this.takeScreenshot(
        //   {
        //     type: 'screenshot',
        //   },
        //   this.page
        // )
      }

      const metrics = await this.collectMetrics()
      response = {
        success: true,
        logs: this.logs,
        metrics,
        // ...(postActionResult && {
        //   screenshots: {
        //     ...(preActionResult && {
        //       pre: {
        //         type: 'image',
        //         source: {
        //           type: 'base64',
        //           media_type: 'image/jpeg',
        //           data: preActionResult.data,
        //         },
        //       },
        //     }),
        // post: {
        //   type: 'image',
        //   source: {
        //     type: 'base64',
        //     media_type: 'image/jpeg',
        //     data: postActionResult.data,
        //   },
        // },
        // },
        // }),
      }

      return response
    } catch (err: any) {
      await this.shutdown()
      return {
        success: false,
        error: err?.message ?? String(err),
        logs: this.logs,
      }
    }
  }

  private logErrorForAnalysis(error: Error) {
    // Add helpful hints based on error patterns
    const errorPatterns: Record<string, string> = {
      'not defined':
        'Check for missing script dependencies or undefined variables',
      'Failed to fetch': 'Verify endpoint URLs and network connectivity',
      '404': 'Resource not found - verify URLs and paths',
      SSL: 'SSL certificate error - check HTTPS configuration',
      ERR_NAME_NOT_RESOLVED: 'DNS resolution failed - check domain name',
      ERR_CONNECTION_TIMED_OUT:
        'Connection timeout - check network or firewall',
      ERR_NETWORK_CHANGED: 'Network changed during request - retry operation',
      ERR_INTERNET_DISCONNECTED: 'No internet connection',
      'Navigation timeout':
        'Page took too long to load - check performance or timeouts',
      WebSocket: 'WebSocket connection issue - check server status',
      ERR_TUNNEL_CONNECTION_FAILED: 'Proxy or VPN connection issue',
      ERR_CERT_: 'SSL/TLS certificate validation error',
      ERR_BLOCKED_BY_CLIENT: 'Request blocked by browser extension or policy',
      ERR_TOO_MANY_REDIRECTS: 'Redirect loop detected',
      'Frame detached': 'Target frame or element no longer exists',
      'Node is detached': 'Element was removed from DOM',
      ERR_ABORTED: 'Request was aborted - possible navigation or reload',
      ERR_CONTENT_LENGTH_MISMATCH:
        'Incomplete response - check server stability',
      ERR_RESPONSE_HEADERS_TRUNCATED: 'Response headers too large or malformed',
    }

    for (const [pattern, hint] of Object.entries(errorPatterns)) {
      if (error.message.includes(pattern)) {
        this.logs.push({
          type: 'info',
          message: `Hint: ${hint}`,
          timestamp: Date.now(),
          category: 'hint',
          source: 'tool',
        })
        break // Stop after first matching pattern
      }
    }
    this.logs.push({
      type: 'error',
      message: `Action error: ${error.message}`,
      timestamp: Date.now(),
      stack: error.stack,
      source: 'tool',
    })
  }
  private async getBrowser(config?: BrowserConfig) {
    // Check if browser exists and is connected
    if (!this.browser || !this.page) {
      await this.startBrowser(config)
    } else {
      try {
        // Test if browser is still responsive
        await this.page.evaluate(() => true)
      } catch (error) {
        // Browser is dead or unresponsive, restart it
        await this.shutdown()
        await this.startBrowser(config)
      }
    }

    if (!this.browser || !this.page) {
      throw new Error('Failed to initialize browser')
    }

    return { browser: this.browser, page: this.page }
  }

  private async startBrowser(config?: BrowserConfig) {
    if (this.browser) {
      await this.shutdown()
    }
    // Set start time for session tracking
    this.startTime = Date.now()

    // Update session configuration
    this.maxConsecutiveErrors =
      config?.maxConsecutiveErrors ?? BROWSER_DEFAULTS.maxConsecutiveErrors
    this.totalErrorThreshold =
      config?.totalErrorThreshold ?? BROWSER_DEFAULTS.totalErrorThreshold

    // Reset error counters
    this.consecutiveErrors = 0
    this.totalErrors = 0

    try {
      // Define helper to find Chrome in standard locations
      const findChrome = () => {
        switch (process.platform) {
          case 'win32':
            return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
          case 'darwin':
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          default:
            return '/usr/bin/google-chrome'
        }
      }

      this.browser = await puppeteer.launch({
        defaultViewport: {
          width: BROWSER_DEFAULTS.viewportWidth,
          height: BROWSER_DEFAULTS.viewportHeight,
        },
        headless: BROWSER_DEFAULTS.headless,
        waitForInitialPage: true,
        args: [
          '--window-size=1200,800',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-sync',
          '--no-sandbox',
          '--no-first-run',
          '--disable-session-crashed-bubble',
          '--disable-restore-session-state',
          '--hide-crash-restore-bubble',
          '--noerrdialogs',
          '--disable-infobars',
        ],
        executablePath: findChrome(),
      })
    } catch (error) {
      // If launch fails, guide the user to install Google Chrome
      console.log(
        `Couldn't launch Chrome browser. Please ensure Google Chrome is installed on your system.\nReceived error: ${error instanceof Error ? error.message : error}`,
      )
      return {
        success: false,
        error:
          'Chrome browser not found. Please install Google Chrome to use browser features.',
        logs: this.logs,
        networkEvents: this.networkEvents,
      }
    }

    // this.logs.push({
    //   type: 'info',
    //   message: 'Browser started',
    //   timestamp: Date.now(),
    //   source: 'tool',
    // })

    // Pick the first existing page or create a new one
    const pages = await this.browser.pages()
    this.page = pages.length > 0 ? pages[0] : await this.browser.newPage()
    this.attachPageListeners()
    await sleep(500)

    return {
      success: true,
      logs: this.logs,
      networkEvents: [],
    }
  }

  private async navigate(
    action: Extract<BrowserAction, { type: 'navigate' }>,
  ): Promise<BrowserResponse> {
    try {
      const { page } = await this.getBrowser(action)
      const url = ensureUrlProtocol(action.url)

      await page.goto(url, {
        waitUntil: action.waitUntil ?? BROWSER_DEFAULTS.waitUntil,
        timeout: action.timeout ?? BROWSER_DEFAULTS.timeout,
      })

      this.logs.push({
        type: 'info',
        message: `Navigated to ${url}`,
        timestamp: Date.now(),
        source: 'tool',
      })

      return {
        success: true,
        logs: this.logs,
        networkEvents: [],
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown navigation error'

      this.logs.push({
        type: 'error',
        message: `Navigation failed: ${errorMessage}`,
        timestamp: Date.now(),
        source: 'tool',
      })
      return {
        success: false,
        error: errorMessage,
        logs: this.logs,
        networkEvents: [],
      }
    }
  }

  private async typeText(action: Extract<BrowserAction, { type: 'type' }>) {
    const { page } = await this.getBrowser()
    await page.type(action.selector, action.text, {
      delay: action.delay ?? BROWSER_DEFAULTS.delay,
    })
  }

  private async scroll(action: Extract<BrowserAction, { type: 'scroll' }>) {
    const { page } = await this.getBrowser()

    // Get viewport height
    const viewport = page.viewport()
    if (!viewport) throw new Error('No viewport found')

    // Default to scrolling down if no direction specified
    const direction = action.direction ?? 'down'
    const scrollAmount = direction === 'up' ? -viewport.height : viewport.height

    await page.evaluate((amount) => {
      ;(globalThis as any).window.scrollBy(0, amount)
    }, scrollAmount)

    this.logs.push({
      type: 'info',
      message: `Scrolled ${direction}`,
      timestamp: Date.now(),
      source: 'tool',
    })

    return {
      success: true,
      logs: this.logs,
      networkEvents: [],
    }
  }

  private async takeScreenshot(
    action: Extract<BrowserAction, { type: 'screenshot' }>,
    page: Page,
  ): Promise<{
    data: string
    logs: BrowserResponse['logs']
  }> {
    // Take a screenshot with aggressive compression settings
    const screenshot = await page.screenshot({
      fullPage: BROWSER_DEFAULTS.fullPage,
      type: 'jpeg',
      quality:
        action.screenshotCompressionQuality ??
        BROWSER_DEFAULTS.screenshotCompressionQuality,
      encoding: 'base64',
    })

    // Log screenshot capture and size
    const sizeInKB = Math.round((screenshot.length * 3) / 4 / 1024)
    this.logs.push({
      type: 'info',
      message: `Captured screenshot (${sizeInKB}KB)`,
      timestamp: Date.now(),
      category: 'screenshot',
      source: 'tool',
    })

    // If debug mode is enabled, save the screenshot
    if (action.debug) {
      console.debug({
        message: 'Saving screenshot to disk...',
        timestamp: Date.now(),
        source: 'tool',
      })

      try {
        const chatDir = getCurrentChatDir()
        const screenshotsDir = path.join(chatDir, 'screenshots')
        ensureDirectoryExists({ baseDir: screenshotsDir, fs })

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `screenshot-${timestamp}.jpg`
        const filepath = path.join(screenshotsDir, filename)

        fs.writeFileSync(filepath, Buffer.from(screenshot, 'base64'))
        console.debug({
          type: 'debug',
          message: `Saved screenshot to ${filepath}`,
          timestamp: Date.now(),
          source: 'tool',
        })

        // Save metadata
        const metadataPath = path.join(
          screenshotsDir,
          `${timestamp}-metadata.json`,
        )
        const metadata = {
          timestamp,
          format: 'jpeg',
          quality: 25,
          fullPage: action.fullPage ?? BROWSER_DEFAULTS.fullPage,
          metrics: await this.collectMetrics(),
        }
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
      } catch (error) {
        console.error({
          message: `Failed to save screenshot: ${(error as Error).message}`,
          timestamp: Date.now(),
          source: 'tool',
        })
        logger.error(
          {
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          'Failed to save screenshot',
        )
      }
    }

    return {
      data: screenshot,
      logs: this.logs,
    }
  }

  private attachPageListeners() {
    if (!this.page) return

    // Console messages
    this.page.on('console', (msg) => {
      const type =
        msg.type() === 'error' ? 'error' : (msg.type() as 'info' | 'warning')
      this.logs.push({
        type,
        message: msg.text(),
        timestamp: Date.now(),
        source: 'browser',
      })
    })

    // Page errors
    this.page.on('pageerror', (err: unknown) => {
      const error = err as Error
      this.logs.push({
        type: 'error',
        message: error.message,
        timestamp: Date.now(),
        stack: error.stack,
        source: 'browser',
      })
      this.jsErrorCount++
    })

    // Network requests
    this.page.on('request', (request: HTTPRequest) => {
      const method = request.method()
      if (method) {
        this.networkEvents.push({
          url: request.url(),
          method,
          timestamp: Date.now(),
        })
      }
    })

    // Network responses
    this.page.on('response', async (response: HTTPResponse) => {
      const req = response.request()
      const index = this.networkEvents.findIndex(
        (evt) => evt.url === req.url() && evt.method === req.method(),
      )

      const status = response.status()
      const errorText =
        status >= 400 ? await response.text().catch(() => '') : undefined

      if (index !== -1) {
        this.networkEvents[index].status = status
        this.networkEvents[index].errorText = errorText
      } else {
        const method = req.method()
        if (method) {
          this.networkEvents.push({
            url: req.url(),
            method,
            status,
            errorText,
            timestamp: Date.now(),
          })
        }
      }

      // Log network errors
      if (status >= 400) {
        this.logs.push({
          type: 'error',
          message: `Network error ${status} for ${req.url()}`,
          timestamp: Date.now(),
          source: 'tool',
        })
      }
    })
  }

  private async collectPerformanceMetrics() {
    if (!this.page) return

    // Collect Web Vitals and other performance metrics
    const metrics = await this.page.evaluate(() => {
      const lcpEntry = (performance as any).getEntriesByType(
        'largest-contentful-paint',
      )[0]
      const navEntry = (performance as any).getEntriesByType(
        'navigation',
      )[0] as any
      const fcpEntry = (performance as any)
        .getEntriesByType('paint')
        .find((entry: any) => entry.name === 'first-contentful-paint')

      return {
        ttfb: navEntry?.responseStart - navEntry?.requestStart,
        lcp: lcpEntry?.startTime,
        fcp: fcpEntry?.startTime,
        domContentLoaded:
          navEntry?.domContentLoadedEventEnd - navEntry?.startTime,
      }
    })

    this.performanceMetrics = metrics
  }

  private async collectMetrics(): Promise<BrowserResponse['metrics']> {
    if (!this.page) return undefined

    const perfEntries = JSON.parse(
      await this.page.evaluate(() =>
        JSON.stringify((performance as any).getEntriesByType('navigation')),
      ),
    )

    let loadTime = 0
    if (perfEntries && perfEntries.length > 0) {
      const navTiming = perfEntries[0]
      loadTime = navTiming.loadEventEnd - navTiming.startTime
    }

    const memoryUsed = await this.page
      .metrics()
      .then((m) => m.JSHeapUsedSize || 0)

    await this.collectPerformanceMetrics()

    return {
      loadTime,
      memoryUsage: memoryUsed,
      jsErrors: this.jsErrorCount,
      networkErrors: this.networkEvents.filter(
        (e) => e.status && e.status >= 400,
      ).length,
      ttfb: this.performanceMetrics.ttfb,
      lcp: this.performanceMetrics.lcp,
      fcp: this.performanceMetrics.fcp,
      domContentLoaded: this.performanceMetrics.domContentLoaded,
      sessionDuration: Date.now() - this.startTime,
    }
  }

  private filterLogs(
    logs: BrowserResponse['logs'],
    filter?: BrowserResponse['logFilter'],
  ): BrowserResponse['logs'] {
    // First deduplicate logs
    const seen = new Set<string>()
    logs = logs.filter((log) => {
      const key = `${log.type}|${log.message}|${log.timestamp}|${log.source}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })

    // Then apply any filters
    if (!filter) return logs

    return logs.filter((log) => {
      if (filter.types && !filter.types.includes(log.type)) return false
      if (filter.minLevel && log.level && log.level < filter.minLevel)
        return false
      if (
        filter.categories &&
        log.category &&
        !filter.categories.includes(log.category)
      )
        return false
      return true
    })
  }

  async execute(action: BrowserAction): Promise<BrowserResponse> {
    try {
      const response = await this.executeWithRetry(action)
      // Filter and deduplicate logs
      response.logs = this.filterLogs(
        response.logs,
        action.logFilter ?? undefined,
      )
      this.logs = [] // Clear logs after sending them in response
      return response
    } catch (error: any) {
      if (
        error.name === 'TargetClosedError' ||
        (error.message && error.message.includes('detached Frame'))
      ) {
        this.logs.push({
          type: 'error',
          message: 'Browser was closed or detached. Starting new session...',
          timestamp: Date.now(),
          category: 'browser',
          source: 'tool',
        })

        await this.shutdown()
        if (action.type !== 'stop') {
          return this.executeWithRetry(action)
        }
      }
      throw error
    }
  }

  public async shutdown() {
    const browser = this.browser
    if (browser) {
      // Clear references first to prevent double shutdown
      this.browser = null
      this.page = null
      try {
        await browser.close()
      } catch (err: unknown) {
        console.error('Error closing browser:', err)
        logger.error(
          {
            errorMessage: err instanceof Error ? err.message : String(err),
            errorStack: err instanceof Error ? err.stack : undefined,
          },
          'Error closing browser',
        )
      }
    }
  }
}

export const handleBrowserInstruction = async (
  action: BrowserAction,
): Promise<BrowserResponse> => {
  const response = await activeBrowserRunner.execute(action)
  return response
}

export const activeBrowserRunner: BrowserRunner = new BrowserRunner()
