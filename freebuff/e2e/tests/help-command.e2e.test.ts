import { execFileSync } from 'node:child_process'

import { describe, expect, test } from 'bun:test'

import { requireFreebuffBinary } from '../utils'

describe('Freebuff: --help flag', () => {
  test('shows CLI usage information', () => {
    const binary = requireFreebuffBinary()
    const output = execFileSync(binary, ['--help'], {
      encoding: 'utf-8',
      timeout: 10_000,
    })

    // Should show the binary name
    expect(output.toLowerCase()).toContain('freebuff')

    // Should show usage info
    expect(output).toMatch(/usage|options|commands/i)
  })

  test('does not reference Codebuff', () => {
    const binary = requireFreebuffBinary()
    const output = execFileSync(binary, ['--help'], {
      encoding: 'utf-8',
      timeout: 10_000,
    })

    // The --help output should say Freebuff, not Codebuff
    expect(output).not.toMatch(/\bcodebuff\b/i)
  })
})
