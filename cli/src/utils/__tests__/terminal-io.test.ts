import { describe, expect, spyOn, test } from 'bun:test'
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  reportFatalErrorSync,
  writeFileDescriptorSync,
  writeTerminalControlSync,
} from '../terminal-io'

function captureDescriptorWrite(write: (fd: number) => void): string {
  const directory = mkdtempSync(join(tmpdir(), 'terminal-fd-'))
  const outputPath = join(directory, 'stderr')

  try {
    const fd = openSync(outputPath, 'w')
    try {
      write(fd)
    } finally {
      closeSync(fd)
    }
    return readFileSync(outputPath, 'utf8')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('synchronous terminal I/O', () => {
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

  test('writes complete diagnostic bytes to an existing descriptor', () => {
    const output = captureDescriptorWrite((fd) => {
      expect(writeFileDescriptorSync(fd, 'fatal: 💥\n')).toBe(true)
    })

    expect(output).toBe('fatal: 💥\n')
  })

  test('reports Error stacks synchronously to the supplied stderr descriptor', () => {
    const output = captureDescriptorWrite((fd) => {
      reportFatalErrorSync('Fatal startup error', new Error('boom'), fd)
    })

    expect(output).toStartWith('Fatal startup error: Error: boom\n')
  })

  test('reports non-Error reasons synchronously', () => {
    const output = captureDescriptorWrite((fd) => {
      reportFatalErrorSync('Unhandled rejection', 'plain reason', fd)
    })

    expect(output).toBe('Unhandled rejection: plain reason\n')
  })

  test('survives rejection reasons that cannot be stringified', () => {
    const output = captureDescriptorWrite((fd) => {
      reportFatalErrorSync('Unhandled rejection', Object.create(null), fd)
    })

    expect(output).toBe('Unhandled rejection: <unprintable error>\n')
  })

  test('survives values whose Error check and string conversion both throw', () => {
    const { proxy, revoke } = Proxy.revocable(new Error('revoked'), {})
    revoke()

    const output = captureDescriptorWrite((fd) => {
      reportFatalErrorSync('Unhandled rejection', proxy, fd)
    })

    expect(output).toBe('Unhandled rejection: <unprintable error>\n')
  })

  test('falls back to an Error message when its stack cannot be read', () => {
    const error = new Error('readable message')
    Object.defineProperty(error, 'stack', {
      get: () => {
        throw new Error('broken stack getter')
      },
    })

    const output = captureDescriptorWrite((fd) => {
      reportFatalErrorSync('Fatal error', error, fd)
    })

    expect(output).toBe('Fatal error: readable message\n')
  })

  test('falls back when an Error stack cannot be stringified', () => {
    const error = new Error('readable message')
    Object.defineProperty(error, 'stack', { value: Object.create(null) })

    const output = captureDescriptorWrite((fd) => {
      reportFatalErrorSync('Fatal error', error, fd)
    })

    expect(output).toBe('Fatal error: readable message\n')
  })

  test('falls back to console error when stderr is unavailable', () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('closed stderr')

    try {
      reportFatalErrorSync('Fatal error', error, -1)
      expect(consoleError).toHaveBeenCalledWith('Fatal error:', error)
    } finally {
      consoleError.mockRestore()
    }
  })
})
