import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'bun:test'

import { requireFreebuffBinary } from '../utils'

describe('Freebuff: --version', () => {
  test('outputs a version string', () => {
    const binary = requireFreebuffBinary()
    const output = execFileSync(binary, ['--version'], {
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim()

    // Should contain a semver-like version (e.g. "0.0.15" or "1.0.0")
    expect(output).toMatch(/\d+\.\d+\.\d+/)
  })

  test('exits with code 0', () => {
    const binary = requireFreebuffBinary()
    // execFileSync throws on non-zero exit codes, so if this doesn't throw, it exited 0
    execFileSync(binary, ['--version'], { encoding: 'utf-8', timeout: 10_000 })
  })

  test('ignores project bunfig.toml preloads', () => {
    const binary = requireFreebuffBinary()
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-bunfig-'))

    try {
      fs.writeFileSync(
        path.join(tmpDir, 'bunfig.toml'),
        'preload = ["$config/db"]\n',
        'utf-8',
      )

      const output = execFileSync(binary, ['--version'], {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 10_000,
      }).trim()

      expect(output).toMatch(/\d+\.\d+\.\d+/)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
