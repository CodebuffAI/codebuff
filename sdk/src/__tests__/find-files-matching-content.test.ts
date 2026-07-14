import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  createMockChildProcess,
  createRgJsonMatch,
} from '@codebuff/common/testing/mocks'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { findFilesMatchingContent } from '../tools/find-files-matching-content'

import type { MockChildProcess } from '@codebuff/common/testing/mocks'

function getValue(
  result: Awaited<ReturnType<typeof findFilesMatchingContent>>,
) {
  const value = result[0].value as
    | {
        files: string[]
        count: number
        truncated?: boolean
        groups?: { file: string; matchCount: number; symbols: string[] }[]
        message: string
      }
    | { errorMessage: string }
  if ('errorMessage' in value) {
    throw new Error(value.errorMessage)
  }
  return value
}

describe('findFilesMatchingContent', () => {
  let mockSpawn: ReturnType<typeof mock>
  let mockProcess: MockChildProcess
  let projectPath: string

  beforeEach(async () => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ffc-'))
    mockProcess = createMockChildProcess()
    mockSpawn = mock(() => mockProcess)
    await mockModule('child_process', () => ({
      spawn: mockSpawn,
    }))
  })

  afterEach(() => {
    mock.restore()
    clearMockedModules()
    fs.rmSync(projectPath, { recursive: true, force: true })
  })

  it('returns unique file paths from ripgrep files-with-matches output', async () => {
    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      maxFiles: 2,
    })

    mockProcess.stdout.emit(
      'data',
      Buffer.from('src/a.ts\nsrc/b.ts\nsrc/a.ts\nsrc/c.ts\n'),
    )
    mockProcess.emit('close', 0)

    const value = getValue(await searchPromise)
    expect(value.files).toEqual(['src/a.ts', 'src/b.ts'])
    expect(value.count).toBe(2)
    expect(value.truncated).toBe(true)
    expect(value.message).toContain('Found 2 unique file(s)')

    const args = mockSpawn.mock.calls[0][1] as string[]
    expect(args).toContain('-l')
    expect(args).toContain('needle')
  })

  it('filters mandatory-sensitive paths from files-only results', async () => {
    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: 'token',
    })
    mockProcess.stdout.emit(
      'data',
      Buffer.from('.env\nsrc/config.ts\nid_ed25519\n'),
    )
    mockProcess.emit('close', 0)

    expect(getValue(await searchPromise).files).toEqual(['src/config.ts'])
  })

  it('rejects cwd values outside the project root', async () => {
    const result = await findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      cwd: '../outside',
    })

    expect(result[0].type).toBe('json')
    const value = result[0].value as { errorMessage: string }
    expect(value.errorMessage).toContain('outside the project directory')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('rejects a file passed as cwd before spawning ripgrep', async () => {
    fs.writeFileSync(path.join(projectPath, 'package.json'), '{}')

    const result = await findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      cwd: 'package.json',
    })

    const value = result[0].value as { errorMessage: string }
    expect(value.errorMessage).toContain('is a file')
    expect(value.errorMessage).toContain('requires a directory')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('rejects cwd symlinks that escape the project root', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffc-outside-'))
    try {
      fs.symlinkSync(outsideDir, path.join(projectPath, 'outside-link'), 'dir')

      const result = await findFilesMatchingContent({
        projectPath,
        pattern: 'needle',
        cwd: 'outside-link',
      })

      const value = result[0].value as { errorMessage: string }
      expect(value.errorMessage).toContain('outside the project directory')
      expect(mockSpawn).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it('allows only safe ripgrep flags', async () => {
    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      flags: '-i -g "*.ts" -g "-*.ts" --type ts',
    })

    mockProcess.stdout.emit('data', Buffer.from('src/a.ts\n'))
    mockProcess.emit('close', 0)

    const value = getValue(await searchPromise)
    expect(value.files).toEqual(['src/a.ts'])
    const args = mockSpawn.mock.calls[0][1] as string[]
    expect(args).toContain('-i')
    expect(args).toContain('-g')
    expect(args).toContain('*.ts')
    expect(args).toContain('-*.ts')
    expect(args).toContain('--type')
    expect(args).toContain('ts')
  })

  it('repairs one accidental outer quote layer around combined flags', async () => {
    for (const flags of ["'-t ts -g src/**'", '"-t ts -g src/**"']) {
      const searchPromise = findFilesMatchingContent({
        projectPath,
        pattern: 'needle',
        flags,
      })

      mockProcess.stdout.emit('data', Buffer.from('src/a.ts\n'))
      mockProcess.emit('close', 0)

      await searchPromise
      const args = mockSpawn.mock.calls.at(-1)![1] as string[]
      expect(args).toEqual(
        expect.arrayContaining(['-t', 'ts', '-g', 'src/**']),
      )
    }
  })

  it('accepts structured argv flag tokens', async () => {
    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      flags: ['-t', 'ts', '-g', 'src/**'],
    })

    mockProcess.stdout.emit('data', Buffer.from('src/a.ts\n'))
    mockProcess.emit('close', 0)

    await searchPromise
    const args = mockSpawn.mock.calls[0][1] as string[]
    expect(args).toEqual(expect.arrayContaining(['-t', 'ts', '-g', 'src/**']))
  })

  it('ignores redundant line-number flags while preserving safe flags', async () => {
    for (const flags of ['-n -i', ['--line-number', '-g', '*.ts']]) {
      const searchPromise = findFilesMatchingContent({
        projectPath,
        pattern: 'needle',
        flags,
      })

      mockProcess.stdout.emit('data', Buffer.from('src/a.ts\n'))
      mockProcess.emit('close', 0)

      await searchPromise
      const args = mockSpawn.mock.calls.at(-1)![1] as string[]
      expect(args).not.toContain('-n')
      expect(args).not.toContain('--line-number')
      if (Array.isArray(flags)) {
        expect(args).toEqual(expect.arrayContaining(['-g', '*.ts']))
      } else {
        expect(args).toContain('-i')
      }
    }
  })

  it('still rejects dangerous flags after outer-quote repair', async () => {
    const result = await findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      flags: "'--exec rm -rf /'",
    })

    const value = result[0].value as { errorMessage: string }
    expect(value.errorMessage).toContain('Unsupported ripgrep flag')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('still rejects dangerous flags passed as structured argv tokens', async () => {
    const result = await findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      flags: ['--exec', 'rm', '-rf', '/'],
    })

    const value = result[0].value as { errorMessage: string }
    expect(value.errorMessage).toContain('Unsupported ripgrep flag')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('preserves spaces inside a quoted glob value', async () => {
    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      flags: "-g 'src/legal docs/**'",
    })

    mockProcess.stdout.emit('data', Buffer.from('src/legal docs/a.ts\n'))
    mockProcess.emit('close', 0)

    await searchPromise
    const args = mockSpawn.mock.calls[0][1] as string[]
    expect(args).toContain('src/legal docs/**')
  })

  it('explains how to recover from malformed quoting', async () => {
    const result = await findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      flags: "-g '*.ts",
    })

    const value = result[0].value as { errorMessage: string }
    expect(value.errorMessage).toContain("unterminated ' quote")
    expect(value.errorMessage).toContain('pass argv tokens')
    expect(value.errorMessage).toContain('Do not embed an extra quote pair')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('rejects unsafe ripgrep flags', async () => {
    const result = await findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      flags: '--files /tmp',
    })

    const value = result[0].value as { errorMessage: string }
    expect(value.errorMessage).toContain('Unsupported ripgrep flag')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('surfaces ripgrep errors instead of returning empty success', async () => {
    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: '[invalid',
    })

    mockProcess.stderr.emit(
      'data',
      Buffer.from('regex parse error: unclosed character class'),
    )
    mockProcess.emit('close', 2)

    const value = (await searchPromise)[0].value as { errorMessage: string }
    expect(value.errorMessage).toContain('ripgrep exited with code 2')
    expect(value.errorMessage).toContain('regex parse error')
  })

  it('returns an error result when spawning ripgrep throws synchronously', async () => {
    mockSpawn = mock(() => {
      throw new Error('spawn rg failed')
    })
    await mockModule('child_process', () => ({
      spawn: mockSpawn,
    }))

    const result = await findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
    })

    const value = result[0].value as { errorMessage: string }
    expect(value.errorMessage).toContain('spawn rg failed')
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })

  it('returns an error result when the ripgrep child emits an error', async () => {
    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
    })

    mockProcess.emit('error', new Error('rg runtime failed'))

    const value = (await searchPromise)[0].value as { errorMessage: string }
    expect(value.errorMessage).toContain('Failed to execute ripgrep')
    expect(value.errorMessage).toContain('rg runtime failed')
    expect(value.errorMessage).toContain('CODEBUFF_RG_PATH')
  })

  it('streams files-with-matches output and caps at maxFiles', async () => {
    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      maxFiles: 3,
    })

    mockProcess.stdout.emit(
      'data',
      Buffer.from('src/a.ts\nsrc/b.ts\nsrc/c.ts\nsrc/d.ts\n'),
    )

    const value = getValue(await searchPromise)
    expect(value.truncated).toBe(true)
    expect(value.count).toBe(3)
    expect(value.files).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
  })

  it('caps an unterminated stdout line without retaining it', async () => {
    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
    })

    mockProcess.stdout.emit('data', Buffer.from('x'.repeat(1024 * 1024 + 1)))

    const value = getValue(await searchPromise)
    expect(value.truncated).toBe(true)
    expect(value.count).toBe(0)
    expect(value.files).toEqual([])
  })

  it('short-circuits when called with an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort(new Error('caller cancelled'))

    const result = await findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      signal: controller.signal,
    })

    const value = result[0].value as { errorMessage: string }
    expect(value.errorMessage).toBe('caller cancelled')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('kills the ripgrep child when the signal aborts mid-flight', async () => {
    const controller = new AbortController()
    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      signal: controller.signal,
    })

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    controller.abort(new Error('stop search'))

    const result = await searchPromise
    const value = result[0].value as { errorMessage: string }
    expect(value.errorMessage).toBe('stop search')
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('optionally groups matches by containing symbols', async () => {
    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(projectPath, 'src/example.ts'),
      [
        'export function first() {',
        '  const value = "needle"',
        '  return value',
        '}',
        '',
        'class Second {',
        '  method() {',
        '    return "needle"',
        '  }',
        '}',
      ].join('\n'),
    )

    const searchPromise = findFilesMatchingContent({
      projectPath,
      pattern: 'needle',
      groupBySymbol: true,
    })

    const output = [
      createRgJsonMatch('src/example.ts', 2, '  const value = "needle"'),
      createRgJsonMatch('src/example.ts', 8, '    return "needle"'),
    ].join('\n')
    mockProcess.stdout.emit('data', Buffer.from(output))
    mockProcess.emit('close', 0)

    const value = getValue(await searchPromise)
    expect(value.files).toEqual(['src/example.ts'])
    expect(value.groups).toEqual([
      {
        file: 'src/example.ts',
        matchCount: 2,
        symbols: ['first', 'method'],
      },
    ])

    const args = mockSpawn.mock.calls[0][1] as string[]
    expect(args).toContain('--json')
    expect(args).not.toContain('-l')
  })
})
