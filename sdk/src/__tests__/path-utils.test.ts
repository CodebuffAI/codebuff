import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  getProjectPathLookupKeys,
  resolveFilePathWithinProject,
} from '../tools/path-utils'

describe('resolveFilePathWithinProject', () => {
  test('normalizes relative paths to full and project-relative paths', () => {
    expect(resolveFilePathWithinProject('/repo', 'src/file.ts')).toMatchObject({
      fullPath: '/repo/src/file.ts',
      relativePath: 'src/file.ts',
    })
  })

  test('normalizes absolute paths inside the project', () => {
    expect(
      resolveFilePathWithinProject('/repo', '/repo/src/file.ts'),
    ).toMatchObject({
      fullPath: '/repo/src/file.ts',
      relativePath: 'src/file.ts',
    })
  })

  test('accepts the project root itself', () => {
    expect(resolveFilePathWithinProject('/repo', '/repo')).toMatchObject({
      fullPath: '/repo',
      relativePath: '',
    })
    expect(resolveFilePathWithinProject('/repo', '.')).toMatchObject({
      fullPath: '/repo',
      relativePath: '',
    })
  })

  test('allows file names that start with two dots inside the project', () => {
    expect(resolveFilePathWithinProject('/repo', '/repo/..config')).toMatchObject(
      {
        fullPath: '/repo/..config',
        relativePath: '..config',
      },
    )
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

describe('resolveFilePathWithinProject — symlink containment', () => {
  let tmpDir: string
  let outsideDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-utils-'))
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
    // In-project symlink that escapes: tmpDir/evil -> outsideDir
    fs.symlinkSync(outsideDir, path.join(tmpDir, 'evil'))
    // Legit in-project symlink: tmpDir/link -> tmpDir/real
    fs.mkdirSync(path.join(tmpDir, 'real'))
    fs.symlinkSync(path.join(tmpDir, 'real'), path.join(tmpDir, 'link'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(outsideDir, { recursive: true, force: true })
  })

  test('rejects a symlink that points outside the project', () => {
    expect(resolveFilePathWithinProject(tmpDir, 'evil')).toBeNull()
    expect(
      resolveFilePathWithinProject(tmpDir, 'evil/file.ts'),
    ).toBeNull()
  })

  test('rejects an outside symlink even when the target file does not exist', () => {
    expect(
      resolveFilePathWithinProject(tmpDir, 'evil/nonexistent.ts'),
    ).toBeNull()
  })

  test('allows a symlink that points inside the project', () => {
    expect(
      resolveFilePathWithinProject(tmpDir, 'link/file.ts'),
    ).toMatchObject({
      fullPath: path.join(tmpDir, 'link', 'file.ts'),
      relativePath: path.join('link', 'file.ts'),
    })
  })

  test('preserves lexical behavior for synthetic non-existent paths', () => {
    // The original tests use '/repo' which doesn't exist on disk.
    // resolveRealPath must fall back to the lexical path in that case.
    expect(resolveFilePathWithinProject('/repo', 'src/file.ts')).toMatchObject({
      fullPath: '/repo/src/file.ts',
      relativePath: 'src/file.ts',
    })
  })
})
