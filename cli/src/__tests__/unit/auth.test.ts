import path from 'node:path'

import { describe, expect, test } from 'bun:test'

import { resolveOpenbuffConfigDir } from '../../utils/auth'

describe('resolveOpenbuffConfigDir', () => {
  test('prefers the explicit Openbuff override', () => {
    expect(
      resolveOpenbuffConfigDir({
        env: {
          OPENBUFF_CONFIG_DIR: '/custom/openbuff',
          XDG_CONFIG_HOME: '/xdg/config',
        },
        platform: 'linux',
        homeDir: '/home/test',
      }),
    ).toBe('/custom/openbuff')
  })

  test('uses XDG_CONFIG_HOME on Unix', () => {
    expect(
      resolveOpenbuffConfigDir({
        env: { XDG_CONFIG_HOME: '/xdg/config' },
        platform: 'linux',
        homeDir: '/home/test',
      }),
    ).toBe(path.join('/xdg/config', 'openbuff'))
  })

  test('uses APPDATA on Windows', () => {
    expect(
      resolveOpenbuffConfigDir({
        env: { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' },
        platform: 'win32',
        homeDir: 'C:\\Users\\test',
      }),
    ).toBe(path.join('C:\\Users\\test\\AppData\\Roaming', 'openbuff'))
  })
})
