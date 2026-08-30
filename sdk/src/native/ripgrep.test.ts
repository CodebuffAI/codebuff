import { describe, expect, test } from 'bun:test'

import { ripgrepPlatformDir } from './ripgrep'

describe('ripgrepPlatformDir', () => {
  test('maps both Windows architectures to their native binaries', () => {
    expect(ripgrepPlatformDir('win32', 'x64')).toBe('x64-win32')
    expect(ripgrepPlatformDir('win32', 'arm64')).toBe('arm64-win32')
  })

  test('rejects an architecture with no bundled binary', () => {
    expect(() => ripgrepPlatformDir('win32', 'ia32')).toThrow(
      'Unsupported platform: win32-ia32',
    )
  })
})
