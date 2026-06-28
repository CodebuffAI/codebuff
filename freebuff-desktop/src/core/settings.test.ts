/** Tests for the file-backed project settings store. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION, SettingsStore } from './settings'

let repoRoot: string

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'freebuff-settings-'))
})

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true })
})

describe('SettingsStore', () => {
  test('returns defaults when no settings file exists', () => {
    const store = new SettingsStore({ repoRoot })
    expect(store.exists()).toBe(false)
    const { settings, errors } = store.read()
    expect(errors).toEqual([])
    expect(settings).toEqual(DEFAULT_SETTINGS)
    expect(settings.preview.entry).toBe('index.html')
  })

  test('writes and reads back a custom entry', () => {
    const store = new SettingsStore({ repoRoot })
    store.write({ version: SETTINGS_SCHEMA_VERSION, preview: { entry: 'dist/index.html' } })
    expect(store.exists()).toBe(true)

    const { settings, errors } = store.read()
    expect(errors).toEqual([])
    expect(settings.preview.entry).toBe('dist/index.html')
  })

  test('write is atomic — never leaves a partial file', () => {
    const store = new SettingsStore({ repoRoot })
    store.write({ version: SETTINGS_SCHEMA_VERSION, preview: { entry: 'app/index.html' } })
    // No dangling .tmp sibling in normal flow.
    const tmp = join(repoRoot, '.freebuff', 'settings.json.tmp')
    expect(require('fs').existsSync(tmp)).toBe(false)
  })

  test('rejects an absolute preview.entry', () => {
    const store = new SettingsStore({ repoRoot })
    expect(() =>
      store.write({ version: SETTINGS_SCHEMA_VERSION, preview: { entry: '/etc/passwd' } }),
    ).toThrow(/relative path/)
  })

  test('rejects a preview.entry containing ..', () => {
    const store = new SettingsStore({ repoRoot })
    expect(() =>
      store.write({ version: SETTINGS_SCHEMA_VERSION, preview: { entry: '../oops.html' } }),
    ).toThrow(/"\.\."/)
  })

  test('falls back to defaults when the file is corrupt JSON', () => {
    const dir = join(repoRoot, '.freebuff')
    require('fs').mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'settings.json'), '{ this is not json')
    const store = new SettingsStore({ repoRoot })
    const { settings, errors } = store.read()
    expect(settings).toEqual(DEFAULT_SETTINGS)
    expect(errors.some((e) => /not valid JSON/i.test(e.message))).toBe(true)
  })

  test('falls back to defaults on unknown future version', () => {
    const dir = join(repoRoot, '.freebuff')
    require('fs').mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ version: 999, preview: { entry: 'anything.html' }, future: 'data' }),
    )
    const store = new SettingsStore({ repoRoot })
    const { settings } = store.read()
    // Unknown future version: start clean so we never silently apply incompatible fields.
    expect(settings.preview.entry).toBe(DEFAULT_SETTINGS.preview.entry)
  })

  test('preserves settings on older equal version with layered defaults', () => {
    // Same-version migration must round-trip the user's chosen entry verbatim.
    const dir = join(repoRoot, '.freebuff')
    require('fs').mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ version: 1, preview: { entry: 'public/index.html' } }),
    )
    const { settings } = new SettingsStore({ repoRoot }).read()
    expect(settings.preview.entry).toBe('public/index.html')
  })

  test('post-write the file contains pretty-printed JSON', () => {
    const store = new SettingsStore({ repoRoot })
    store.write({ version: SETTINGS_SCHEMA_VERSION, preview: { entry: 'foo.html' } })
    const text = readFileSync(join(repoRoot, '.freebuff', 'settings.json'), 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  ')
  })
})
