import { describe, expect, it } from 'bun:test'

import { collectDocumentRefs } from '@/server/chat/document-refs'

import type { ChatDocumentRef } from '@/server/chat/store'

function ref(storageId: string, name = storageId): ChatDocumentRef {
  return {
    storageId,
    mediaType: 'text/plain',
    name,
    chars: 10,
    truncated: false,
  }
}

describe('collectDocumentRefs', () => {
  it('flattens attachments across rows, preserving order', () => {
    const rows = [
      { attachments: [ref('a'), ref('b')] },
      { attachments: [ref('c')] },
    ]
    expect(collectDocumentRefs(rows, 10).map((r) => r.storageId)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('dedupes by storageId (keeps first seen)', () => {
    const rows = [
      { attachments: [ref('a', 'first')] },
      { attachments: [ref('a', 'second'), ref('b')] },
    ]
    const out = collectDocumentRefs(rows, 10)
    expect(out.map((r) => r.storageId)).toEqual(['a', 'b'])
    expect(out[0]!.name).toBe('first')
  })

  it('caps at the limit', () => {
    const rows = [{ attachments: [ref('a'), ref('b'), ref('c'), ref('d')] }]
    expect(collectDocumentRefs(rows, 2).map((r) => r.storageId)).toEqual([
      'a',
      'b',
    ])
  })

  it('skips rows without an attachments array and entries missing storageId', () => {
    const rows = [
      { attachments: null },
      { attachments: 'nope' },
      { attachments: [{ name: 'no id' } as unknown as ChatDocumentRef, ref('x')] },
    ]
    expect(collectDocumentRefs(rows, 10).map((r) => r.storageId)).toEqual(['x'])
  })

  it('returns empty for no rows', () => {
    expect(collectDocumentRefs([], 10)).toEqual([])
  })
})
