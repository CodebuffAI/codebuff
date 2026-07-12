import { describe, expect, test } from 'bun:test'

import {
  TEST_REPOS_DIR,
  extractRepoNameFromUrl,
  setupTestRepo,
} from '../setup-test-repo'

describe('extractRepoNameFromUrl', () => {
  test('parses HTTPS URLs (no .git suffix)', () => {
    expect(extractRepoNameFromUrl('https://github.com/user/repo')).toBe('repo')
  })

  test('parses HTTPS URLs with trailing .git', () => {
    expect(
      extractRepoNameFromUrl('https://github.com/AnzoBenjamin/openbuff.git'),
    ).toBe('openbuff')
  })

  test('parses SSH URLs (git@host:owner/repo)', () => {
    expect(extractRepoNameFromUrl('git@github.com:user/repo.git')).toBe('repo')
  })

  test('parses file:// URLs to their last path segment', () => {
    expect(extractRepoNameFromUrl('file:///home/ben/Code/CLI/openbuff')).toBe(
      'openbuff',
    )
  })

  test('parses file:// URLs with a trailing slash', () => {
    expect(extractRepoNameFromUrl('file:///home/ben/Code/CLI/openbuff/')).toBe(
      'openbuff',
    )
  })
})

describe('setupTestRepo file:// self-clone guard', () => {
  test('rejects a file:// URL that points directly at TEST_REPOS_DIR', async () => {
    const dirUrl = `file://${TEST_REPOS_DIR}`
    await expect(setupTestRepo(dirUrl, 'guard-direct', 'HEAD')).rejects.toThrow(
      /Refusing to clone file:\/\/ URL/,
    )
  })

  test('rejects a file:// URL nested beneath TEST_REPOS_DIR', async () => {
    const nestedUrl = `file://${TEST_REPOS_DIR}/openbuff-HEAD`
    await expect(
      setupTestRepo(nestedUrl, 'guard-nested', 'HEAD'),
    ).rejects.toThrow(/Refusing to clone file:\/\/ URL/)
  })

  test('does not trigger the guard for a file:// URL outside TEST_REPOS_DIR', async () => {
    const outsideUrl = 'file:///tmp/some-other-worktree/openbuff'
    await expect(
      setupTestRepo(outsideUrl, 'guard-outside', 'HEAD'),
    ).rejects.not.toThrow(/Refusing to clone file:\/\/ URL/)
  })

  test('uses URL decoding when resolving file:// paths', async () => {
    const encodedUrl = `file://${encodeURIComponent(TEST_REPOS_DIR + '/child')}`
    await expect(
      setupTestRepo(encodedUrl, 'guard-encoded', 'HEAD'),
    ).rejects.toThrow(/Refusing to clone file:\/\/ URL/)
  })

  test('does not perform any I/O when the guard rejects a file:// URL', async () => {
    const nestedUrl = `file://${TEST_REPOS_DIR}/child-clone`
    await expect(
      setupTestRepo(nestedUrl, 'guard-no-io', 'HEAD'),
    ).rejects.toThrow()
  })
})
