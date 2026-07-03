import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { spawnSync } from 'child_process'

import { describe, expect, test } from 'bun:test'

const repoRoot = path.resolve(__dirname, '../../..')
const packageVersion = JSON.parse(
  readFileSync(path.join(repoRoot, 'cli/package.json'), 'utf8'),
).version
const wrappers = [
  ['release', 'cli/release/index.js'],
  ['release-staging', 'cli/release-staging/index.js'],
] as const

function runWrapperWithTarBlocked(wrapperPath: string, flag: string) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'openbuff-release-wrapper-'))
  const preloadPath = path.join(tempDir, 'block-tar.cjs')

  writeFileSync(
    preloadPath,
    `const Module = require('module')\n` +
      `const originalLoad = Module._load\n` +
      `Module._load = function(request, parent, isMain) {\n` +
      `  if (request === 'tar') throw new Error('tar should not be required for version flags')\n` +
      `  return originalLoad.apply(this, arguments)\n` +
      `}\n`,
  )

  try {
    return spawnSync(process.execPath, ['--require', preloadPath, wrapperPath, flag], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: '',
      },
    })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

describe('release wrapper version flags', () => {
  test.each(wrappers)('%s --version exits before requiring tar', (_, wrapperPath) => {
    const result = runWrapperWithTarBlocked(wrapperPath, '--version')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toBe(packageVersion)
  })

  test.each(wrappers)('%s -v exits before requiring tar', (_, wrapperPath) => {
    const result = runWrapperWithTarBlocked(wrapperPath, '-v')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toBe(packageVersion)
  })
})
