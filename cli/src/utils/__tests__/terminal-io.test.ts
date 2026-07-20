import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { writeTerminalControlSync } from '../terminal-io'

describe('writeTerminalControlSync', () => {
  test('writes the complete byte sequence before returning', () => {
    const directory = mkdtempSync(join(tmpdir(), 'terminal-io-'))
    const outputPath = join(directory, 'tty')
    const sequence = '\x1b[?1049l\x1b[?25h'
    writeFileSync(outputPath, '')

    try {
      expect(writeTerminalControlSync(sequence, outputPath)).toBe(true)
      expect(readFileSync(outputPath)).toEqual(Buffer.from(sequence))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('returns false when the terminal cannot be opened', () => {
    expect(writeTerminalControlSync('reset', '/path/that/does/not/exist')).toBe(
      false,
    )
  })
})
