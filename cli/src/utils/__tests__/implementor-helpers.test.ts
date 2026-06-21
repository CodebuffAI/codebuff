import { describe, expect, test } from 'bun:test'

import { isImplementorAgent, getImplementorDisplayName } from '../implementor-helpers'

describe('implementor helpers', () => {
  test('identifies the default editor implementor', () => {
    expect(isImplementorAgent({ agentType: 'editor-implementor', blocks: [] })).toBe(true)
    expect(isImplementorAgent({ agentType: 'file-picker', blocks: [] })).toBe(false)
  })

  test('formats default implementor names', () => {
    expect(getImplementorDisplayName('editor-implementor')).toBe('Implementor')
    expect(getImplementorDisplayName('editor-implementor', 1)).toBe('Implementor #2')
  })
})
