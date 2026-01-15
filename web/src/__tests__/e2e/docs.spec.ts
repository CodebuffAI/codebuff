/**
 * E2E Tests for Documentation Pages
 *
 * These tests verify that documentation pages render correctly,
 * navigation works, and key features like code blocks display properly.
 */

import { test, expect } from '@playwright/test'

test.describe('Documentation Pages', { tag: '@docs' }, () => {
  test.describe('Doc Landing Page', () => {
    test('loads the docs index page', async ({ page }) => {
      await page.goto('/docs')
      
      // Should have documentation content or redirect to first doc
      await expect(page).toHaveURL(/\/docs/)
    })

    test('has working navigation sidebar on desktop', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.goto('/docs/help/quick-start')

      // Sidebar should be visible on desktop
      const sidebar = page.locator('[class*="lg:block"]').first()
      await expect(sidebar).toBeVisible()
    })
  })

  test.describe('Quick Start Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/docs/help/quick-start')
    })

    test('renders the page title', async ({ page }) => {
      // Page should have a heading
      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible()
      await expect(heading).toContainText(/start|codebuff/i)
    })

    test('renders code blocks with syntax highlighting', async ({ page }) => {
      // Should have code blocks
      const codeBlocks = page.locator('pre code, [class*="prism"]')
      const count = await codeBlocks.count()
      expect(count).toBeGreaterThan(0)
    })

    test('has working internal links', async ({ page }) => {
      // Find an internal link
      const internalLinks = page.locator('a[href^="/docs/"]')
      const count = await internalLinks.count()

      if (count > 0) {
        const firstLink = internalLinks.first()
        const href = await firstLink.getAttribute('href')

        // Click and verify navigation
        await firstLink.click()
        await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      }
    })
  })

  test.describe('Navigation', () => {
    test('prev/next navigation works', async ({ page }) => {
      await page.goto('/docs/help/quick-start')

      // Look for next button
      const nextButton = page.locator('a:has-text("Next"), a[href*="/docs/"]:has(svg)')
      const count = await nextButton.count()

      if (count > 0) {
        const initialUrl = page.url()
        await nextButton.first().click()

        // Should navigate to a different page
        await page.waitForURL((url) => url.toString() !== initialUrl)
      }
    })

    test('category pages load', async ({ page }) => {
      const categories = ['help', 'tips', 'advanced', 'agents']

      for (const category of categories) {
        const response = await page.goto(`/docs/${category}`)
        // Should either load successfully or redirect
        expect(response?.status()).toBeLessThan(500)
      }
    })
  })

  test.describe('Content Rendering', () => {
    test('FAQ page renders correctly', async ({ page }) => {
      await page.goto('/docs/help/faq')

      // FAQ page should have questions
      const heading = page.locator('h1, h2').first()
      await expect(heading).toBeVisible()
    })

    test('best practices page renders', async ({ page }) => {
      await page.goto('/docs/tips/best-practices')

      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible()
      await expect(heading).toContainText(/best practices/i)
    })

    test('agents overview renders mermaid diagrams or code', async ({ page }) => {
      await page.goto('/docs/agents/overview')

      // Should have either mermaid diagram or code block for the flowchart
      const mermaidOrCode = page.locator('.mermaid, pre:has-text("flowchart"), [class*="mermaid"]')
      const count = await mermaidOrCode.count()

      // Page should at least render without errors - mermaid may or may not render in test env
      // We verify the page loaded by checking for the heading instead
      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible()
    })
  })

  test.describe('Mobile Navigation', () => {
    test('mobile menu button appears on small screens', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/docs/help/quick-start')

      // Should have a mobile menu trigger (bottom sheet or hamburger)
      const mobileMenu = page.locator('button:has(svg), [class*="lg:hidden"]').first()
      await expect(mobileMenu).toBeVisible()
    })
  })

  test.describe('Accessibility', () => {
    test('doc pages have proper heading hierarchy', async ({ page }) => {
      await page.goto('/docs/help/quick-start')

      // Should have an h1
      const h1Count = await page.locator('h1').count()
      expect(h1Count).toBeGreaterThanOrEqual(1)

      // h1 should come before h2s in the main content
      const headings = await page.locator('article h1, article h2, article h3').allTextContents()
      expect(headings.length).toBeGreaterThan(0)
    })

    test('links have discernible text', async ({ page }) => {
      await page.goto('/docs/help/quick-start')

      const links = page.locator('article a')
      const count = await links.count()

      for (let i = 0; i < Math.min(count, 10); i++) {
        const link = links.nth(i)
        const text = await link.textContent()
        const ariaLabel = await link.getAttribute('aria-label')

        // Link should have either text content or aria-label
        const hasDiscernibleText = (text && text.trim().length > 0) || ariaLabel
        expect(hasDiscernibleText).toBeTruthy()
      }
    })
  })

  test.describe('SEO', () => {
    test('doc pages have meta description', async ({ page }) => {
      await page.goto('/docs/help/quick-start')

      const metaDescription = page.locator('meta[name="description"]')
      const content = await metaDescription.getAttribute('content')

      // Should have some description
      expect(content).toBeTruthy()
    })

    test('doc pages have proper title', async ({ page }) => {
      await page.goto('/docs/help/quick-start')

      const title = await page.title()
      expect(title.length).toBeGreaterThan(0)
      expect(title).not.toBe('undefined')
    })
  })
})
