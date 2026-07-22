import { spawn } from 'child_process'
import path from 'path'

import { expect, test } from 'bun:test'

import { ensureCliTestEnv } from './test-utils'

ensureCliTestEnv()

const LAUNCHER_FIXTURE = path.join(
  import.meta.dir,
  'helpers',
  'launcher-disconnect-fixture.cjs',
)
const RENDERER_FIXTURE = path.join(
  import.meta.dir,
  'helpers',
  'renderer-cleanup-fixture.tsx',
)

test('the CLI exits cleanly when its package launcher disappears', async () => {
  const result = await new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
    output: string
  }>((resolve, reject) => {
    const child = spawn(
      'node',
      [LAUNCHER_FIXTURE, 'observe', RENDERER_FIXTURE],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      resolve({ code, signal, output })
    })
  })

  if (result.code !== 0) {
    console.error(result.output)
  }
  expect(result.code).toBe(0)
  expect(result.signal).toBeNull()
  expect(result.output).toContain('CLEAN_EXIT_VISIBLE')
  expect(result.output).toContain('CLI_EXITED_AFTER_LAUNCHER')
  expect(result.output).not.toContain('CLI survived after its launcher exited')
}, 15_000)
