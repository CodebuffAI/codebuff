import * as projectFileTree from '@codebuff/common/project-file-tree'
import { describe, test, expect, afterEach, spyOn } from 'bun:test'

import { glob } from '../tools/glob'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

const PROJECT_PATH = '/project'

// The glob tool only uses `getProjectFileTree` + `flattenTree` to enumerate
// candidate file paths, then matches with micromatch. We stub the tree so the
// test controls exactly which project-relative paths exist.
function mockFileTree(filePaths: string[]) {
  spyOn(projectFileTree, 'getProjectFileTree').mockResolvedValue({} as any)
  spyOn(projectFileTree, 'flattenTree').mockReturnValue(
    filePaths.map((filePath) => ({ type: 'file', filePath })) as any,
  )
}

const fs = {} as unknown as CodebuffFileSystem

function getValue(result: Awaited<ReturnType<typeof glob>>) {
  const value = result[0].value as
    | { files: string[]; count: number; message: string }
    | { errorMessage: string }
  if ('errorMessage' in value) {
    throw new Error(`glob returned error: ${value.errorMessage}`)
  }
  return value
}

describe('glob tool', () => {
  afterEach(() => {
    spyOn(projectFileTree, 'getProjectFileTree').mockRestore()
    spyOn(projectFileTree, 'flattenTree').mockRestore()
  })

  test('matches patterns against project-relative paths when no cwd', async () => {
    mockFileTree([
      'src/a.ts',
      'src/b.ts',
      'src/nested/c.ts',
      'docs/readme.md',
    ])

    const value = getValue(
      await glob({ pattern: 'src/*.ts', projectPath: PROJECT_PATH, fs }),
    )

    expect(value.files.sort()).toEqual(['src/a.ts', 'src/b.ts'])
    expect(value.count).toBe(2)
  })

  test('matches cwd-relative patterns and returns project-relative paths', async () => {
    mockFileTree([
      'pkg/sub/a.txt',
      'pkg/sub/b.txt',
      'pkg/sub/c.ts',
      'pkg/other/d.txt',
      'top.txt',
    ])

    const value = getValue(
      await glob({
        pattern: '*.txt',
        projectPath: PROJECT_PATH,
        cwd: 'pkg/sub',
        fs,
      }),
    )

    // Pattern "*.txt" is relative to cwd, so it matches the two .txt files
    // directly under pkg/sub, and the returned paths stay project-relative.
    expect(value.files.sort()).toEqual(['pkg/sub/a.txt', 'pkg/sub/b.txt'])
    expect(value.count).toBe(2)
    expect(value.message).toContain('in directory "pkg/sub"')
  })

  test('supports ** within a cwd scope', async () => {
    mockFileTree([
      'pkg/sub/a.txt',
      'pkg/sub/deep/nested/e.txt',
      'pkg/sub/deep/f.ts',
      'pkg/other/d.txt',
    ])

    const value = getValue(
      await glob({
        pattern: '**/*.txt',
        projectPath: PROJECT_PATH,
        cwd: 'pkg/sub',
        fs,
      }),
    )

    expect(value.files.sort()).toEqual([
      'pkg/sub/a.txt',
      'pkg/sub/deep/nested/e.txt',
    ])
    expect(value.count).toBe(2)
  })

  test('handles trailing slash on cwd', async () => {
    mockFileTree(['pkg/sub/a.ts', 'pkg/sub/b.ts', 'pkg/sub2/c.ts'])

    const value = getValue(
      await glob({
        pattern: '*.ts',
        projectPath: PROJECT_PATH,
        cwd: 'pkg/sub/',
        fs,
      }),
    )

    expect(value.files.sort()).toEqual(['pkg/sub/a.ts', 'pkg/sub/b.ts'])
  })

  test('treats cwd dot as project root', async () => {
    mockFileTree(['src/a.ts', 'src/nested/b.ts', 'docs/readme.md'])

    const value = getValue(
      await glob({
        pattern: 'src/*.ts',
        projectPath: PROJECT_PATH,
        cwd: '.',
        fs,
      }),
    )

    expect(value.files.sort()).toEqual(['src/a.ts'])
  })

  test('normalizes leading dot slash in cwd', async () => {
    mockFileTree(['pkg/sub/a.ts', 'pkg/sub/b.ts', 'pkg/sub2/c.ts'])

    const value = getValue(
      await glob({
        pattern: '*.ts',
        projectPath: PROJECT_PATH,
        cwd: './pkg/sub',
        fs,
      }),
    )

    expect(value.files.sort()).toEqual(['pkg/sub/a.ts', 'pkg/sub/b.ts'])
  })

  test('does not match files outside the cwd scope', async () => {
    mockFileTree(['pkg/sub/a.ts', 'pkg/subextra/b.ts'])

    const value = getValue(
      await glob({
        pattern: '*.ts',
        projectPath: PROJECT_PATH,
        cwd: 'pkg/sub',
        fs,
      }),
    )

    // "pkg/subextra/b.ts" must NOT be included just because its prefix
    // starts with "pkg/sub".
    expect(value.files).toEqual(['pkg/sub/a.ts'])
  })
})
