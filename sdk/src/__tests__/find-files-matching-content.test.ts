import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  createMockChildProcess,
  createRgJsonMatch,
} from '@codebuff/common/testing/mocks'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'
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
