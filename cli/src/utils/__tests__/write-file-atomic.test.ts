import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { writeFileAtomic } from '../write-file-atomic'

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
})
