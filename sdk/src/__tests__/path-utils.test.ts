import { describe, expect, test } from 'bun:test'

import {
  getProjectPathLookupKeys,
  resolveFilePathWithinProject,
} from '../tools/path-utils'

describe('resolveFilePathWithinProject', () => {
  test('normalizes relative paths to full and project-relative paths', () => {
    expect(resolveFilePathWithinProject('/repo', 'src/file.ts')).toEqual({
      fullPath: '/repo/src/file.ts',
      relativePath: 'src/file.ts',
    })
  })

  test('normalizes absolute paths inside the project', () => {
    expect(resolveFilePathWithinProject('/repo', '/repo/src/file.ts')).toEqual({
      fullPath: '/repo/src/file.ts',
      relativePath: 'src/file.ts',
    })
  })

  test('allows file names that start with two dots inside the project', () => {
    expect(resolveFilePathWithinProject('/repo', '/repo/..config')).toEqual({
      fullPath: '/repo/..config',
      relativePath: '..config',
    })
  })

  test('rejects paths outside the project', () => {
    expect(resolveFilePathWithinProject('/repo', '../outside.ts')).toBeNull()
    expect(resolveFilePathWithinProject('/repo', '/outside.ts')).toBeNull()
    expect(
      resolveFilePathWithinProject('/repo', '/repo-sibling/file.ts'),
    ).toBeNull()
  })
})

describe('getProjectPathLookupKeys', () => {
  test('returns the normalized relative key before the original absolute key', () => {
    expect(getProjectPathLookupKeys('/repo', '/repo/src/file.ts')).toEqual([
      'src/file.ts',
      '/repo/src/file.ts',
    ])
  })

  test('dedupes relative paths that are already normalized', () => {
    expect(getProjectPathLookupKeys('/repo', 'src/file.ts')).toEqual([
      'src/file.ts',
    ])
  })

  test('returns only the original key for paths outside the project', () => {
    expect(getProjectPathLookupKeys('/repo', '/outside.ts')).toEqual([
      '/outside.ts',
    ])
  })
})
