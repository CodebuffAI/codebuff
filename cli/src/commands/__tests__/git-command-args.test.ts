import { describe, expect, test } from 'bun:test'

import { buildSafeGitCommand, parseSafeGitArgs } from '../git-command-args'

describe('safe git convenience command arguments', () => {
  test('preserves ordinary flags, revisions, and quoted paths', () => {
    expect(parseSafeGitArgs('--stat HEAD~2 "folder with spaces"')).toEqual([
      '--stat',
      'HEAD~2',
      'folder with spaces',
    ])
    expect(buildSafeGitCommand('diff', '--cached')).toBe("git diff '--cached'")
  })

  test.each(['; touch /tmp/pwned', '$(whoami)', '`whoami`', '| sh', '> out'])(
    'rejects shell syntax: %s',
    (input) => expect(() => parseSafeGitArgs(input)).toThrow(),
  )

  test('uses a safe default for status', () => {
    expect(buildSafeGitCommand('status', '', ['--short'])).toBe(
      "git status '--short'",
    )
  })
})
