import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  isPathInsideProject,
  resolveProjectPath,
} from '../project-path-containment'

describe('isPathInsideProject', () => {
  test('accepts project-relative paths', () => {
    expect(isPathInsideProject('/repo', 'src/file.ts')).toBe(true)
    expect(isPathInsideProject('/repo', 'src/nested/file.ts')).toBe(true)
  })

  test('accepts absolute paths inside the project', () => {
    expect(isPathInsideProject('/repo', '/repo/src/file.ts')).toBe(true)
  })

  test('accepts the project root itself', () => {
    expect(isPathInsideProject('/repo', '/repo')).toBe(true)
    expect(isPathInsideProject('/repo', '.')).toBe(true)
  })

  test('rejects empty input', () => {
    expect(isPathInsideProject('/repo', '')).toBe(false)
  })

  test('rejects parent-traversal', () => {
    expect(isPathInsideProject('/repo', '../outside.ts')).toBe(false)
    expect(isPathInsideProject('/repo', '../../outside.ts')).toBe(false)
  })

  test('normalizes embedded .. segments before containment check', () => {
    // `path.resolve` collapses `src/../outside.ts` to `/repo/outside.ts`,
    // which is inside the project — so the helper accepts it. This matches
    // the SDK's `resolveFilePathWithinProject` semantics; traversal payloads
    // that escape the project must begin with `..` from the project root.
    expect(isPathInsideProject('/repo', 'src/../outside.ts')).toBe(true)
  })

  test('rejects absolute paths outside the project', () => {
    expect(isPathInsideProject('/repo', '/outside.ts')).toBe(false)
    expect(isPathInsideProject('/repo', '/etc/passwd')).toBe(false)
  })

  test('rejects sibling-directory prefix matches', () => {
    expect(isPathInsideProject('/repo', '/repo-sibling/file.ts')).toBe(false)
    expect(isPathInsideProject('/repo', '/repo-evil/file.ts')).toBe(false)
  })
})

describe('resolveProjectPath', () => {
  test('returns a relative path with forward slashes and an absolute fullPath', () => {
    const result = resolveProjectPath('/repo', 'src/nested/file.ts')
    expect(result).not.toBeNull()
    expect(result!.relativePath).toBe('src/nested/file.ts')
    expect(result!.fullPath).toBe(path.resolve('/repo/src/nested/file.ts'))
  })

  test('handles absolute input by re-rooting it relative to the project', () => {
    const result = resolveProjectPath('/repo', '/repo/src/file.ts')
    expect(result).not.toBeNull()
    expect(result!.relativePath).toBe('src/file.ts')
  })

  test('accepts the project root itself', () => {
    const absoluteResult = resolveProjectPath('/repo', '/repo')
    expect(absoluteResult).not.toBeNull()
    expect(absoluteResult!.relativePath).toBe('')
    expect(absoluteResult!.fullPath).toBe(path.resolve('/repo'))

    const relativeResult = resolveProjectPath('/repo', '.')
    expect(relativeResult).not.toBeNull()
    expect(relativeResult!.relativePath).toBe('')
    expect(relativeResult!.fullPath).toBe(path.resolve('/repo'))
  })

  test('returns null for traversal payloads', () => {
    expect(resolveProjectPath('/repo', '../outside.ts')).toBeNull()
    expect(resolveProjectPath('/repo', '/etc/passwd')).toBeNull()
  })

  test('preserves lexical behavior for synthetic non-existent paths', () => {
    // /repo doesn't exist on disk in unit tests; the helper should fall
    // back to the lexical resolution so test mocks keep working.
    const result = resolveProjectPath('/repo', 'src/file.ts')
    expect(result).not.toBeNull()
    expect(result!.relativePath).toBe('src/file.ts')
  })
})

describe('isPathInsideProject — symlink containment', () => {
  let tmpDir: string
  let outsideDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-contain-'))
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
    expect(isPathInsideProject(tmpDir, 'evil')).toBe(false)
    expect(isPathInsideProject(tmpDir, 'evil/file.ts')).toBe(false)
  })

  test('rejects an outside symlink even when the target does not exist', () => {
    expect(isPathInsideProject(tmpDir, 'evil/nonexistent.ts')).toBe(false)
  })

  test('allows a symlink that points inside the project', () => {
    expect(isPathInsideProject(tmpDir, 'link/file.ts')).toBe(true)
  })
})
