import { describe, expect, test } from 'bun:test'

import { parseCliArgs } from '../cli-args'

const parse = (args: string[]) =>
  parseCliArgs(['node', 'openbuff', ...args], {
    version: '1.2.3',
    exitOverride: true,
  })

describe('production CLI argument parser', () => {
  test('parses agent, cwd, mode, trust, logs, and prompt together', () => {
    expect(
      parse([
        '--agent',
        'reviewer',
        '--cwd',
        '/repo',
        '--plan',
        '--trust-project-agents',
        '--clear-logs',
        'review',
        'this',
      ]),
    ).toEqual({
      agent: 'reviewer',
      clearLogs: true,
      continue: false,
      continueId: null,
      cwd: '/repo',
      initialMode: 'PLAN',
      initialPrompt: 'review this',
      trustProjectAgents: true,
    })
  })

  test('parses continuation with and without an id', () => {
    expect(parse(['--continue']).continueId).toBeNull()
    expect(parse(['--continue', 'chat-123']).continueId).toBe('chat-123')
  })

  test('does not treat a positional directory as cwd', () => {
    const result = parse(['/tmp/project'])
    expect(result.cwd).toBeUndefined()
    expect(result.initialPrompt).toBe('/tmp/project')
  })

  test('keeps compatibility --local as a no-op', () => {
    expect(parse(['--local', 'hello']).initialPrompt).toBe('hello')
  })

  test('handles empty arguments', () => {
    expect(parse([])).toMatchObject({
      initialPrompt: null,
      continue: false,
      clearLogs: false,
      trustProjectAgents: false,
    })
  })

  test.each([['--help'], ['-h'], ['--version'], ['-v']])(
    'uses Commander output paths for %s',
    (arg) => {
      expect(() => parse([arg])).toThrow()
    },
  )
})
