import puppeteer, { Browser, Page } from 'puppeteer'
import { BrowserAction, BrowserResponse } from 'common/src/browser-actions'

// Manages browser sessions across the application
export const browserSessions = new Map<string, BrowserRunner>()

export class BrowserRunner {
  private browser: Browser | null = null
  private page: Page | null = null
  private logs: BrowserResponse['logs'] = []
  private jsErrorCount = 0

  async execute(action: BrowserAction): Promise<BrowserResponse> {
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
        case 'screenshot':
          return await this.takeScreenshot(action)
        case 'stop':
          await this.shutdown()
          return {
            success: true,
            logs: this.logs,
          }
        default:
          throw new Error(`Unknown action type: ${(action as BrowserAction).type}`)
      }

      const metrics = await this.collectMetrics()
      return {
        success: true,
        logs: this.logs,
        metrics,
      }
    } catch (err: any) {
      await this.shutdown()
      return {
        success: false,
        error: err?.message ?? String(err),
        logs: this.logs,
      }
    }
  }

  private async startBrowser(action: Extract<BrowserAction, { type: 'start' }>) {
    if (this.browser) {
      await this.shutdown()
    }

    this.browser = await puppeteer.launch({
      headless: action.headless ?? true,
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
      waitUntil: action.waitUntil ?? 'networkidle0',
      timeout: action.timeout ?? 15000,
    })
  }

  private async click(action: Extract<BrowserAction, { type: 'click' }>) {
    if (!this.page) throw new Error('No browser page found; call start first.')
    await this.page.click(action.selector, { button: action.button })
    if (action.waitForNavigation) {
      await this.page.waitForNavigation({
        waitUntil: 'networkidle0',
        timeout: action.timeout ?? 15000,
      })
    }
  }

  private async typeText(action: Extract<BrowserAction, { type: 'type' }>) {
    if (!this.page) throw new Error('No browser page found; call start first.')
    await this.page.type(action.selector, action.text, { delay: action.delay ?? 100 })
  }

  private async takeScreenshot(
    action: Extract<BrowserAction, { type: 'screenshot' }>
  ): Promise<BrowserResponse> {
    if (!this.page) throw new Error('No browser page found; call start first.')
    const screenshotBuffer = await this.page.screenshot({
      fullPage: action.fullPage,
      quality: action.quality,
      type: 'jpeg',
      encoding: 'binary',
    })

    const metrics = await this.collectMetrics()
    return {
      success: true,
      logs: this.logs,
      screenshot: screenshotBuffer.toString(),
      metrics,
    }
  }

  private async shutdown() {
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

  private attachPageListeners() {
    if (!this.page) return
    this.page.on('console', (msg) => {
      const type = msg.type() === 'error' ? 'error' : (msg.type() as 'info' | 'warning')
      this.logs.push({
        type,
        message: msg.text(),
        timestamp: Date.now(),
      })
    })

    this.page.on('pageerror', (err) => {
      this.logs.push({
        type: 'error',
        message: err.message,
        timestamp: Date.now(),
        stack: err.stack,
      })
      this.jsErrorCount++
    })
  }

  private async collectMetrics(): Promise<BrowserResponse['metrics']> {
    if (!this.page) return undefined

    const perfEntries = JSON.parse(
      await this.page.evaluate(() => JSON.stringify(performance.getEntriesByType('navigation')))
    )

    let loadTime = 0
    if (perfEntries && perfEntries.length > 0) {
      const navTiming = perfEntries[0]
      loadTime = navTiming.loadEventEnd - navTiming.startTime
    }

    const memoryUsed = await this.page.metrics().then((m) => m.JSHeapUsedSize || 0)

    return {
      loadTime,
      memoryUsage: memoryUsed,
      jsErrors: this.jsErrorCount,
    }
  }
}
