import puppeteer, { Browser, Page, HTTPRequest, HTTPResponse } from 'puppeteer'
import {
  BrowserAction,
  BrowserResponse,
  BROWSER_DEFAULTS,
} from 'common/src/browser-actions'
import * as fs from 'fs'
import * as path from 'path'
import { getDebugDir } from './project-files'
import { ensureDirectoryExists } from 'common/util/file'

// Single browser instance for the application
let activeBrowserRunner: BrowserRunner | null = null

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

  // Session configuration
  private maxConsecutiveErrors = 3
  private totalErrorThreshold = 10
  private sessionTimeoutMs = 5 * 60 * 1000 // 5 minutes
  private sessionDebug = false
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
    action: BrowserAction
  ): Promise<BrowserResponse> {
    // Check session timeout
    if (Date.now() - this.startTime > this.sessionTimeoutMs) {
      const msg = `Session time limit of ${this.sessionTimeoutMs}ms exceeded. Shutting down.`
      this.logs.push({ type: 'error', message: msg, timestamp: Date.now() })
      await this.shutdown()
      return {
        success: false,
        error: msg,
        logs: this.logs,
        networkEvents: this.networkEvents,
      }
    }

    const retryOptions = action.retryOptions ?? BROWSER_DEFAULTS.retryOptions
    let lastError: Error | null = null

    for (
      let attempt = 0;
      attempt <= (retryOptions.maxRetries ?? 3);
      attempt++
    ) {
      if (this.sessionDebug) {
        this.logs.push({
          type: 'debug',
          message: `Executing action: ${JSON.stringify(action)}`,
          timestamp: Date.now(),
          category: 'debug',
        })
      }
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
          this.logs.push({ type: 'error', message: msg, timestamp: Date.now() })
          await this.shutdown()
          return {
            success: false,
            error: msg,
            logs: this.logs,
            networkEvents: this.networkEvents,
          }
        }

        if (this.totalErrors >= this.totalErrorThreshold) {
          const msg = `Total error threshold reached (${this.totalErrorThreshold}).`
          this.logs.push({ type: 'error', message: msg, timestamp: Date.now() })
          await this.shutdown()
          return {
            success: false,
            error: msg,
            logs: this.logs,
            networkEvents: this.networkEvents,
          }
        }
        lastError = error
        const shouldRetry = retryOptions.retryOnErrors?.includes(error.name)
        if (!shouldRetry || attempt === retryOptions.maxRetries) {
          throw error
        }
        await new Promise((resolve) =>
          setTimeout(resolve, retryOptions.retryDelay ?? 1000)
        )
        this.logs.push({
          type: 'info',
          message: `Retrying action (attempt ${attempt + 1}/${retryOptions.maxRetries})`,
          timestamp: Date.now(),
          category: 'retry',
        })
      }
    }
    throw lastError
  }

  private async executeAction(action: BrowserAction): Promise<BrowserResponse> {
    try {
      switch (action.type) {
        case 'start':
          await this.startBrowser(action)
          break
        case 'navigate':
          await this.navigate(action)
          break
        case 'click':
          await this.click(action)
          break
        case 'type':
          await this.typeText(action)
          break
        case 'scroll':
          await this.scroll(action)
          break
        case 'screenshot':
          return await this.takeScreenshot(action)
        case 'stop':
          await this.shutdown()
          return {
            success: true,
            logs: this.logs,
            metrics: await this.collectMetrics(),
            networkEvents: this.networkEvents,
          }
        default:
          throw new Error(
            `Unknown action type: ${(action as BrowserAction).type}`
          )
      }

      const metrics = await this.collectMetrics()
      const response: BrowserResponse = {
        success: true,
        logs: this.logs,
        metrics,
        networkEvents: this.networkEvents,
      }

      return response
    } catch (err: any) {
      await this.shutdown()
      return {
        success: false,
        error: err?.message ?? String(err),
        logs: this.logs,
        networkEvents: this.networkEvents,
      }
    }
  }

  private logErrorForAnalysis(error: Error) {
    if (this.sessionDebug) {
      this.logs.push({
        type: 'debug',
        message: `Debug: ${error.stack || error.message}`,
        timestamp: Date.now(),
        category: 'debug',
      })
    }

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
        })
        break // Stop after first matching pattern
      }
    }

    this.logs.push({
      type: 'error',
      message: `Action error: ${error.message}`,
      timestamp: Date.now(),
      stack: error.stack,
    })
  }

  private async startBrowser(
    action: Extract<BrowserAction, { type: 'start' }>
  ) {
    if (this.browser) {
      await this.shutdown()
    }

    // Update session configuration
    this.maxConsecutiveErrors =
      action.maxConsecutiveErrors ?? BROWSER_DEFAULTS.maxConsecutiveErrors
    this.totalErrorThreshold =
      action.totalErrorThreshold ?? BROWSER_DEFAULTS.totalErrorThreshold
    this.sessionTimeoutMs =
      action.sessionTimeoutMs ?? BROWSER_DEFAULTS.sessionTimeoutMs
    this.sessionDebug = action.debug ?? BROWSER_DEFAULTS.debug

    // Reset error counters
    this.consecutiveErrors = 0
    this.totalErrors = 0

    this.browser = await puppeteer.launch({
      headless: action.headless ?? BROWSER_DEFAULTS.headless,
      defaultViewport: { width: 1280, height: 800 },
    })

    const pages = await this.browser.pages()
    this.page = pages.length > 0 ? pages[0] : await this.browser.newPage()

    this.attachPageListeners()

    await this.page.goto(action.url, {
      waitUntil: 'networkidle0',
      timeout: action.timeout ?? 15000,
    })
  }

  private async navigate(action: Extract<BrowserAction, { type: 'navigate' }>) {
    if (!this.page) throw new Error('No browser page found; call start first.')
    await this.page.goto(action.url, {
      waitUntil: action.waitUntil ?? BROWSER_DEFAULTS.waitUntil,
      timeout: action.timeout ?? BROWSER_DEFAULTS.timeout,
    })
  }

  private async click(action: Extract<BrowserAction, { type: 'click' }>) {
    if (!this.page) throw new Error('No browser page found; call start first.')
    await this.page.click(action.selector, {
      button: action.button ?? BROWSER_DEFAULTS.button,
    })
    if (action.waitForNavigation ?? BROWSER_DEFAULTS.waitForNavigation) {
      await this.page.waitForNavigation({
        waitUntil: 'networkidle0',
        timeout: action.timeout ?? 15000,
      })
    }
  }

  private async typeText(action: Extract<BrowserAction, { type: 'type' }>) {
    if (!this.page) throw new Error('No browser page found; call start first.')
    await this.page.type(action.selector, action.text, {
      delay: action.delay ?? BROWSER_DEFAULTS.delay,
    })
  }

  private async scroll(action: Extract<BrowserAction, { type: 'scroll' }>) {
    if (!this.page) throw new Error('No browser page found; call start first.')

    // Get viewport height
    const viewport = this.page.viewport()
    if (!viewport) throw new Error('No viewport found')

    // Default to scrolling down if no direction specified
    const direction = action.direction ?? 'down'
    const scrollAmount = direction === 'up' ? -viewport.height : viewport.height

    await this.page.evaluate((amount) => {
      window.scrollBy(0, amount)
    }, scrollAmount)
  }

  private async takeScreenshot(
    action: Extract<BrowserAction, { type: 'screenshot' }>
  ): Promise<BrowserResponse> {
    if (!this.page) throw new Error('No browser page found; call start first.')

    // Take a simple screenshot with fixed settings
    const screenshot = await this.page.screenshot({
      fullPage: action.fullPage ?? BROWSER_DEFAULTS.fullPage,
      type: 'jpeg',
      quality:
        action.screenshotCompressionQuality ??
        BROWSER_DEFAULTS.screenshotCompressionQuality,
      encoding: 'base64',
    })

    // If debug mode is enabled, save the screenshot
    if (true) {
      try {
        const screenshotsDir = getDebugDir('screenshots')

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `screenshot-${timestamp}.jpg`
        const filepath = path.join(screenshotsDir, filename)

        fs.writeFileSync(filepath, Buffer.from(screenshot, 'base64'))
        this.logs.push({
          type: 'debug',
          message: `Saved screenshot to ${filepath}`,
          timestamp: Date.now(),
          category: 'debug',
        })

        // Save metadata
        const metadataPath = path.join(
          screenshotsDir,
          `${timestamp}-metadata.json`
        )
        const metadata = {
          timestamp,
          format: 'jpeg',
          quality: 40,
          fullPage: action.fullPage ?? BROWSER_DEFAULTS.fullPage,
          metrics: await this.collectMetrics(),
        }
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
      } catch (error) {
        this.logs.push({
          type: 'error',
          message: `Failed to save screenshot: ${(error as Error).message}`,
          timestamp: Date.now(),
          category: 'debug',
        })
      }
    }

    const metrics = await this.collectMetrics()
    return {
      success: true,
      logs: this.logs,
      screenshot,
      metrics,
      networkEvents: this.networkEvents,
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
      })
    })

    // Page errors
    this.page.on('pageerror', (err) => {
      this.logs.push({
        type: 'error',
        message: err.message,
        timestamp: Date.now(),
        stack: err.stack,
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
        (evt) => evt.url === req.url() && evt.method === req.method()
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
        })
      }
    })
  }

  private async collectPerformanceMetrics() {
    if (!this.page) return

    // Collect Web Vitals and other performance metrics
    const metrics = await this.page.evaluate(() => {
      const lcpEntry = performance.getEntriesByType(
        'largest-contentful-paint'
      )[0]
      const navEntry = performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming
      const fcpEntry = performance
        .getEntriesByType('paint')
        .find((entry) => entry.name === 'first-contentful-paint')

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
        JSON.stringify(performance.getEntriesByType('navigation'))
      )
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
        (e) => e.status && e.status >= 400
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
    filter?: BrowserResponse['logFilter']
  ): BrowserResponse['logs'] {
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
    if (action.type === 'start') {
      this.startTime = Date.now()
    }

    try {
      const response = await this.executeWithRetry(action)
      response.logs = this.filterLogs(
        response.logs,
        action.logFilter ?? undefined
      )
      return response
    } catch (error: any) {
      if (error.name === 'TargetClosedError') {
        this.logs.push({
          type: 'error',
          message:
            'Browser crashed or was closed unexpectedly. Attempting recovery...',
          timestamp: Date.now(),
          category: 'browser',
        })

        // Try to recover by restarting browser
        await this.shutdown()
        if (action.type !== 'stop') {
          await this.startBrowser({
            type: 'start',
            url: 'about:blank',
            headless: true,
            timeout: 15000,
          })
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
      } catch (err) {
        console.error('Error closing browser:', err)
      }
    }
  }
}

export const handleBrowserInstruction = async (
  action: BrowserAction,
  _id: string // Keep parameter for compatibility but don't use it
): Promise<BrowserResponse> => {
  // For start action, create new browser if none exists
  if (action.type === 'start') {
    if (activeBrowserRunner) {
      await activeBrowserRunner.shutdown()
    }
    activeBrowserRunner = new BrowserRunner()
  }

  // Ensure we have an active browser
  if (!activeBrowserRunner) {
    return {
      success: false,
      error: 'No active browser session. Please start a new session first.',
      logs: [
        {
          type: 'error',
          message: 'No active browser session',
          timestamp: Date.now(),
        },
      ],
      networkEvents: [],
    }
  }

  const response = await activeBrowserRunner.execute(action)

  // Clean up session if browser is stopped or on error
  if (action.type === 'stop' || !response.success) {
    await activeBrowserRunner.shutdown()
    activeBrowserRunner = null
  }

  return response
}
