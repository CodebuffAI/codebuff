import { describe, expect, test } from 'bun:test'

import { isBroadProjectRoot } from '../broad-roots'

describe('isBroadProjectRoot on macOS', () => {
  const home = '/Users/zane'
  const broad = (root: string) => isBroadProjectRoot(root, home, 'darwin')

  test('the filesystem root, home and the folders above it are broad', () => {
    for (const root of ['/', '/Users', '/Users/zane', '/Users/zane/', '/users/ZANE']) {
      expect(broad(root)).toBe(true)
    }
  })

  test('user folders directly under home are broad, case-insensitively', () => {
    for (const name of [
      'Desktop',
      'Documents',
      'Downloads',
      'Library',
      'Pictures',
      'Movies',
      'Music',
      'Public',
      'Applications',
      'Videos',
      'OneDrive',
      'OneDrive - Acme Corp',
      'iCloud Drive',
      'Dropbox',
      'Google Drive',
      'desktop',
      'DOCUMENTS',
    ]) {
      expect(broad(`${home}/${name}`)).toBe(true)
    }
  })

  test('the macOS cloud-storage roots are broad', () => {
    for (const root of [
      `${home}/Library/Mobile Documents`,
      `${home}/Library/Mobile Documents/com~apple~CloudDocs`,
      `${home}/Library/CloudStorage`,
      `${home}/Library/CloudStorage/GoogleDrive-zane@example.com`,
      `${home}/OneDrive/Documents`,
    ]) {
      expect(broad(root)).toBe(true)
    }
  })

  test('system folders and volume roots are broad', () => {
    for (const root of [
      '/tmp',
      '/private/tmp',
      '/var',
      '/etc',
      '/Applications',
      '/System',
      '/usr',
      '/opt',
      '/Volumes',
      '/Volumes/External',
      '/Library',
    ]) {
      expect(broad(root)).toBe(true)
    }
  })

  test('a project inside any of them is not broad', () => {
    for (const root of [
      `${home}/Documents/my-app`,
      `${home}/Desktop/site`,
      `${home}/code/freebuff`,
      `${home}/Library/Mobile Documents/com~apple~CloudDocs/app`,
      `${home}/Dropbox/work/api`,
      '/tmp/scratch-app',
      '/Volumes/External/repo',
      '/opt/service',
      `${home}/projects`,
    ]) {
      expect(broad(root)).toBe(false)
    }
  })

  test('`..` is resolved before judging', () => {
    expect(broad(`${home}/code/..`)).toBe(true)
    expect(broad(`${home}/Documents/app/../..`)).toBe(true)
    expect(broad(`${home}/Documents/./app`)).toBe(false)
  })

  test('a relative path is broad: it cannot be placed', () => {
    expect(broad('my-app')).toBe(true)
    expect(broad('')).toBe(true)
  })
})

describe('isBroadProjectRoot on Linux', () => {
  const home = '/home/zane'
  const broad = (root: string) => isBroadProjectRoot(root, home, 'linux')

  test('root, /home, home and its user folders are broad', () => {
    for (const root of ['/', '/home', home, `${home}/Desktop`, `${home}/Downloads`]) {
      expect(broad(root)).toBe(true)
    }
  })

  test('mount roots are broad, projects are not', () => {
    expect(broad('/mnt/data')).toBe(true)
    expect(broad('/media/usb')).toBe(true)
    expect(broad('/mnt/data/repo')).toBe(false)
    expect(broad(`${home}/src/app`)).toBe(false)
  })

  test('home is compared case-sensitively', () => {
    expect(broad('/home/ZANE')).toBe(false)
  })
})

describe('isBroadProjectRoot on Windows', () => {
  const home = 'C:\\Users\\Zane'
  const broad = (root: string) => isBroadProjectRoot(root, home, 'win32')

  test('drive roots, Users, home and user folders are broad', () => {
    for (const root of [
      'C:\\',
      'c:/',
      'D:\\',
      'C:\\Users',
      'C:\\Users\\Zane',
      'c:\\users\\zane\\',
      'C:\\Users\\Zane\\Desktop',
      'C:\\Users\\Zane\\Documents',
      'C:\\Users\\Zane\\OneDrive',
      'C:\\Users\\Zane\\OneDrive - Contoso',
      'C:\\Users\\Zane\\OneDrive\\Desktop',
      'C:\\Windows',
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      'C:\\ProgramData',
      '\\\\server\\share',
    ]) {
      expect(broad(root)).toBe(true)
    }
  })

  test('projects are not broad', () => {
    for (const root of [
      'C:\\Users\\Zane\\Documents\\my-app',
      'C:\\Users\\Zane\\source\\repos\\api',
      'D:\\code\\app',
      'C:\\Users\\Zane\\OneDrive\\Documents\\site',
      '\\\\server\\share\\repo',
    ]) {
      expect(broad(root)).toBe(false)
    }
  })

  test('a path with no drive is broad', () => {
    expect(broad('\\Users\\Zane\\app')).toBe(true)
  })
})
