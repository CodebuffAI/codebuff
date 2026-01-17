import { describe, test, expect } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../hooks/use-theme'
import { UserErrorBanner } from '../user-error-banner'

initializeThemeStore()

describe('UserErrorBanner', () => {
  test('renders error message', () => {
    const markup = renderToStaticMarkup(
      <UserErrorBanner error="Something went wrong" />,
    )

    expect(markup).toContain('Error')
    expect(markup).toContain('Something went wrong')
  })

  test('renders with context length exceeded error', () => {
    const errorMessage =
      "This endpoint's maximum context length is 200000 tokens. However, you requested about 201209 tokens."

    const markup = renderToStaticMarkup(
      <UserErrorBanner error={errorMessage} />,
    )

    expect(markup).toContain('Error')
    expect(markup).toContain('200000 tokens')
    expect(markup).toContain('201209 tokens')
  })

  test('renders with network error', () => {
    const markup = renderToStaticMarkup(
      <UserErrorBanner error="Network request failed: Connection refused" />,
    )

    expect(markup).toContain('Error')
    expect(markup).toContain('Network request failed')
    expect(markup).toContain('Connection refused')
  })

  test('returns null for empty error message', () => {
    const markup = renderToStaticMarkup(<UserErrorBanner error="" />)

    // Empty error should render nothing
    expect(markup).toBe('')
  })

  test('returns null for whitespace-only error message', () => {
    const markup = renderToStaticMarkup(<UserErrorBanner error="   " />)

    // Whitespace-only error should render nothing
    expect(markup).toBe('')
  })

  test('renders with multiline error message', () => {
    const multilineError = 'First line of error\nSecond line of error'

    const markup = renderToStaticMarkup(
      <UserErrorBanner error={multilineError} />,
    )

    expect(markup).toContain('Error')
    expect(markup).toContain('First line of error')
    expect(markup).toContain('Second line of error')
  })

  test('renders with special characters in error message', () => {
    const specialCharsError = 'Error with <html> tags & "quotes"'

    const markup = renderToStaticMarkup(
      <UserErrorBanner error={specialCharsError} />,
    )

    expect(markup).toContain('Error')
    // HTML entities should be escaped in the markup
    expect(markup).toContain('&lt;html&gt;')
    expect(markup).toContain('&amp;')
    expect(markup).toContain('&quot;quotes&quot;')
  })

  test('renders with long error message', () => {
    const longError = 'A'.repeat(500)

    const markup = renderToStaticMarkup(
      <UserErrorBanner error={longError} />,
    )

    expect(markup).toContain('Error')
    expect(markup).toContain(longError)
  })

  test('renders with custom title', () => {
    const markup = renderToStaticMarkup(
      <UserErrorBanner error="Something went wrong" title="Network Error" />,
    )

    expect(markup).toContain('Network Error')
    expect(markup).toContain('Something went wrong')
  })
})
