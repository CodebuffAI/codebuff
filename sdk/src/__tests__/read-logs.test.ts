import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { readLogs } from '../tools/read-logs'

const tempDirs: string[] = []

const makeTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-read-logs-'))
  tempDirs.push(dir)
  return dir
}

const value = (output: Awaited<ReturnType<typeof readLogs>>): any => output[0].value

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('readLogs', () => {
  test('returns the requested tail of a file inside cwd', async () => {
    const cwd = makeTempDir()
    fs.writeFileSync(path.join(cwd, 'app.log'), 'one\ntwo\nthree\nfour\n')

    const result = value(
      await readLogs({ cwd, path: 'app.log', lines: 2, max_chars: 1_000 }),
    )

    expect(result.errorMessage).toBeUndefined()
    expect(result.resolvedPath).toBe(path.join(cwd, 'app.log'))
    expect(result.content).toBe('three\nfour\n')
  })

  test('rejects relative paths outside cwd', async () => {
    const cwd = makeTempDir()
    const outside = makeTempDir()
    fs.writeFileSync(path.join(outside, 'secret.log'), 'secret\n')

    const result = value(
      await readLogs({
        cwd,
        path: path.relative(cwd, path.join(outside, 'secret.log')),
      }),
    )

    expect(result.errorMessage).toContain('outside the project directory')
  })

  test('rejects absolute paths outside cwd', async () => {
    const cwd = makeTempDir()
    const outside = makeTempDir()
    const outsideFile = path.join(outside, 'secret.log')
    fs.writeFileSync(outsideFile, 'secret\n')

    const result = value(await readLogs({ cwd, path: outsideFile }))

    expect(result.errorMessage).toContain('outside the project directory')
  })

  test('rejects symlinks that resolve outside cwd', async () => {
    const cwd = makeTempDir()
    const outside = makeTempDir()
    const outsideFile = path.join(outside, 'secret.log')
    fs.writeFileSync(outsideFile, 'secret\n')
    fs.symlinkSync(outsideFile, path.join(cwd, 'link.log'))

    const result = value(await readLogs({ cwd, path: 'link.log' }))

    expect(result.errorMessage).toContain('outside the project directory')
  })
})
