import { describe, it, expect } from 'bun:test'
import { DEFAULT_ORG_PREFIX } from '@codebuff/common/util/agent-name-normalization'
import { resolveCliAgentId } from './resolve'

describe('resolveCliAgentId', () => {
  it('returns undefined when input is undefined', () => {
    expect(resolveCliAgentId(undefined, [])).toBeUndefined()
  })

  it('preserves explicitly prefixed identifiers', () => {
    expect(resolveCliAgentId('publisher/name', [])).toBe('publisher/name')
    expect(resolveCliAgentId(`${DEFAULT_ORG_PREFIX}foo@1.2.3`, [])).toBe(
      `${DEFAULT_ORG_PREFIX}foo@1.2.3`,
    )
  })
  it('returns input as-is when it exists locally', () => {
    expect(resolveCliAgentId('local-agent', ['local-agent'])).toBe(
      'local-agent',
    )
  })

  it('prefixes unknown, unprefixed ids with DEFAULT_ORG_PREFIX', () => {
    expect(resolveCliAgentId('unknown', [])).toBe(
      `${DEFAULT_ORG_PREFIX}unknown`,
    )
  })
})
