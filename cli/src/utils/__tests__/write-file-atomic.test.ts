import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { writeFileAtomic, writeFileAtomicAsync } from '../write-file-atomic'

let tempDir = ''

describe('writeFileAtomic', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-atomic-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('writes a new file', () => {
    const target = path.join(tempDir, 'out.json')

    writeFileAtomic(target, '{"a":1}')

    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}')
  })

  test('replaces an existing file', () => {
    const target = path.join(tempDir, 'out.json')
    fs.writeFileSync(target, 'old content')

    writeFileAtomic(target, 'new content')

    expect(fs.readFileSync(target, 'utf8')).toBe('new content')
  })

  test('leaves no temp file behind on success', () => {
    const target = path.join(tempDir, 'out.json')

    writeFileAtomic(target, 'data')

    expect(fs.readdirSync(tempDir)).toEqual(['out.json'])
  })

  test('cleans up the temp file and rethrows on failure', () => {
    // Renaming a file over an existing directory fails on all platforms
    const target = path.join(tempDir, 'target-dir')
    fs.mkdirSync(target)

    expect(() => writeFileAtomic(target, 'data')).toThrow()

    expect(fs.readdirSync(tempDir)).toEqual(['target-dir'])
  })

  test('uses a unique temp name per write (no collision between calls)', () => {
    // Two writes to different targets must not share a temp path, otherwise
    // concurrent sync + async writes would tear each other. The temp name
    // includes a random component, so back-to-back writes never collide.
    const a = path.join(tempDir, 'a.json')
    const b = path.join(tempDir, 'b.json')

    writeFileAtomic(a, 'a')
    writeFileAtomic(b, 'b')

    expect(fs.readdirSync(tempDir).sort()).toEqual(['a.json', 'b.json'])
  })
})

describe('writeFileAtomicAsync', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-atomic-async-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('writes a new file', async () => {
    const target = path.join(tempDir, 'out.json')

    await writeFileAtomicAsync(target, '{"a":1}')

    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}')
  })

  test('replaces an existing file', async () => {
    const target = path.join(tempDir, 'out.json')
    fs.writeFileSync(target, 'old content')

    await writeFileAtomicAsync(target, 'new content')

    expect(fs.readFileSync(target, 'utf8')).toBe('new content')
  })

  test('leaves no temp file behind on success', async () => {
    const target = path.join(tempDir, 'out.json')

    await writeFileAtomicAsync(target, 'data')

    expect(fs.readdirSync(tempDir)).toEqual(['out.json'])
  })

  test('cleans up the temp file and rejects on failure', async () => {
    const target = path.join(tempDir, 'target-dir')
    fs.mkdirSync(target)

    await expect(writeFileAtomicAsync(target, 'data')).rejects.toThrow()

    expect(fs.readdirSync(tempDir)).toEqual(['target-dir'])
  })

  test('concurrent writes to the same file do not tear (last write wins)', async () => {
    const target = path.join(tempDir, 'out.json')

    await Promise.all([
      writeFileAtomicAsync(target, 'first'),
      writeFileAtomicAsync(target, 'second'),
      writeFileAtomicAsync(target, 'third'),
    ])

    // Whichever rename lands last wins, but the file is always one intact
    // value — never a torn mix — and no temp files remain.
    expect(['first', 'second', 'third']).toContain(
      fs.readFileSync(target, 'utf8'),
    )
    expect(fs.readdirSync(tempDir)).toEqual(['out.json'])
  })
})
