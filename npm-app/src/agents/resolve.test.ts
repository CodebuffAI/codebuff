import { describe, it, expect } from 'bun:test'
import { resolveCliAgentId } from './resolve'

describe('resolveCliAgentId', () => {
  it('returns undefined when input is undefined', () => {
    expect(resolveCliAgentId(undefined, [])).toBeUndefined()
  })

  it('preserves explicitly prefixed identifiers', () => {
    expect(resolveCliAgentId('publisher/name', [])).toBe('publisher/name')
    expect(resolveCliAgentId('codebuff/foo@1.2.3', [])).toBe('codebuff/foo@1.2.3')
  })

  it('returns input as-is when it exists locally', () => {
    expect(resolveCliAgentId('local-agent', ['local-agent'])).toBe('local-agent')
  })

  it('prefixes unknown, unprefixed ids with codebuff/', () => {
    expect(resolveCliAgentId('unknown', [])).toBe('codebuff/unknown')
  })
})
