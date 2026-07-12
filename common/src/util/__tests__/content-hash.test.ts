import { describe, expect, it } from 'bun:test'

import { decodeReadCapabilityToken } from '../content-hash'

describe('read capability errors', () => {
  it('identifies legacy whole-file mutation tokens', () => {
    expect(decodeReadCapabilityToken('whole.legacy-token')).toContain(
      'legacy mutation capability',
    )
  })
})
