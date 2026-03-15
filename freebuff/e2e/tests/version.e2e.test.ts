import { execSync } from 'child_process'

import { describe, expect, test } from 'bun:test'

import { requireFreebuffBinary } from '../utils'

describe('Freebuff: --version', () => {
  test('outputs a version string', () => {
    const binary = requireFreebuffBinary()
    const output = execSync(`'${binary}' --version`, {
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim()

    // Should contain a semver-like version (e.g. "0.0.15" or "1.0.0")
    expect(output).toMatch(/\d+\.\d+\.\d+/)
  })

  test('exits with code 0', () => {
    const binary = requireFreebuffBinary()
    // execSync throws on non-zero exit codes, so if this doesn't throw, it exited 0
    execSync(`'${binary}' --version`, { encoding: 'utf-8', timeout: 10_000 })
  })
})
