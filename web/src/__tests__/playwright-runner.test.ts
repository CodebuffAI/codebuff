export {}

import { describe, expect, it, setDefaultTimeout } from 'bun:test'

setDefaultTimeout(10 * 60 * 1000)

describe('playwright e2e suite', () => {
  it('passes', async () => {
    const proc = Bun.spawn(
      ['bunx', 'playwright', 'test', '-c', 'web/playwright.config.ts'],
      {
        stdout: 'inherit',
        stderr: 'inherit',
      },
    )

    const exitCode = await proc.exited
    expect(exitCode).toBe(0)
  })
})
