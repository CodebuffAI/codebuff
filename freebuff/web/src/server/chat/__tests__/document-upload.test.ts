import { describe, expect, it } from 'bun:test'

import { classifyAttachment } from '@/app/chat/models'
import { searchDocs } from '@/server/chat/document-context'
import {
  EmptyDocumentError,
  extractText,
  UnsupportedDocumentError,
} from '@/server/chat/extract'

function bytesOf(text: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(text)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

describe('classifyAttachment', () => {
  it('classifies images by MIME', () => {
    expect(classifyAttachment('a.png', 'image/png')).toBe('image')
    expect(classifyAttachment('shot', 'image/jpeg')).toBe('image')
  })
  it('classifies code/text by extension even with junk MIME', () => {
    // Browsers report video/mp2t for .ts, empty for .py.
    expect(classifyAttachment('index.ts', 'video/mp2t')).toBe('document')
    expect(classifyAttachment('main.py', '')).toBe('document')
    expect(classifyAttachment('data.csv', 'text/csv')).toBe('document')
    expect(classifyAttachment('notes.md', '')).toBe('document')
  })
  it('classifies extensionless well-known files', () => {
    expect(classifyAttachment('Dockerfile', '')).toBe('document')
    expect(classifyAttachment('Makefile', 'application/octet-stream')).toBe(
      'document',
    )
  })
  it('rejects unsupported types', () => {
    expect(classifyAttachment('movie.mp4', 'video/mp4')).toBeNull()
    expect(classifyAttachment('blob.bin', 'application/octet-stream')).toBeNull()
  })
})

describe('extractText', () => {
  it('extracts plain text and normalizes CRLF', async () => {
    const r = await extractText({
      bytes: bytesOf('line1\r\nline2\r\n'),
      mediaType: 'text/plain',
      fileName: 'a.txt',
    })
    expect(r.text).toBe('line1\nline2\n')
    expect(r.truncated).toBe(false)
  })
  it('extracts code with an unreliable MIME', async () => {
    const code = 'export function hello() { return 42 }\n'
    const r = await extractText({
      bytes: bytesOf(code),
      mediaType: 'video/mp2t',
      fileName: 'hello.ts',
    })
    expect(r.text).toBe(code)
  })
  it('strips a UTF-8 BOM', async () => {
    const r = await extractText({
      bytes: bytesOf('﻿hi'),
      mediaType: 'text/plain',
      fileName: 'a.txt',
    })
    expect(r.text).toBe('hi')
  })
  it('rejects empty files', async () => {
    await expect(
      extractText({ bytes: bytesOf('   \n'), mediaType: 'text/plain', fileName: 'a.txt' }),
    ).rejects.toBeInstanceOf(EmptyDocumentError)
  })
  it('rejects binary masquerading as text (NUL bytes)', async () => {
    const u8 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x01, 0x02])
    const buf = u8.buffer.slice(0, u8.byteLength) as ArrayBuffer
    await expect(
      extractText({ bytes: buf, mediaType: 'text/plain', fileName: 'fake.txt' }),
    ).rejects.toBeInstanceOf(UnsupportedDocumentError)
  })
  it('rejects unsupported types', async () => {
    await expect(
      extractText({ bytes: bytesOf('x'), mediaType: 'video/mp4', fileName: 'm.mp4' }),
    ).rejects.toBeInstanceOf(UnsupportedDocumentError)
  })
})

describe('extractText — PDF & DOCX (Phase 2)', () => {
  async function readFixture(name: string): Promise<ArrayBuffer> {
    const u8 = await Bun.file(`${import.meta.dir}/fixtures/${name}`).bytes()
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
  }

  it('extracts text from a real PDF', async () => {
    const bytes = await readFixture('sample.pdf')
    const r = await extractText({
      bytes,
      mediaType: 'application/pdf',
      fileName: 'sample.pdf',
    })
    expect(r.text).toContain('PDF_SECRET_TOKEN_77')
    expect(r.truncated).toBe(false)
  })

  it('extracts text from a real DOCX', async () => {
    const bytes = await readFixture('sample.docx')
    const r = await extractText({
      bytes,
      mediaType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'sample.docx',
    })
    expect(r.text).toContain('DOCX_SECRET_TOKEN_88')
  })

  it('rejects a corrupt PDF', async () => {
    const buf = new TextEncoder().encode('%PDF-1.4 not really a pdf')
      .buffer as ArrayBuffer
    await expect(
      extractText({ bytes: buf, mediaType: 'application/pdf', fileName: 'x.pdf' }),
    ).rejects.toBeInstanceOf(UnsupportedDocumentError)
  })
})

describe('searchDocs', () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`)
  lines[49] = 'the SECRET_TOKEN is here'
  lines[120] = 'function computeTotal(a, b) {'
  const doc = { name: 'big.txt', text: lines.join('\n'), truncated: false }

  it('finds a match with line numbers and context', () => {
    const { matches, totalMatches } = searchDocs([doc], 'SECRET_TOKEN', false)
    expect(totalMatches).toBe(1)
    expect(matches).toHaveLength(1)
    expect(matches[0]!.file).toBe('big.txt')
    // ±3 lines of context around line 50.
    expect(matches[0]!.startLine).toBe(47)
    expect(matches[0]!.endLine).toBe(53)
    expect(matches[0]!.snippet).toContain('50: the SECRET_TOKEN is here')
  })

  it('is case-insensitive for substring search', () => {
    const { totalMatches } = searchDocs([doc], 'secret_token', false)
    expect(totalMatches).toBe(1)
  })

  it('supports regex search', () => {
    const { matches } = searchDocs([doc], 'function \\w+\\(', true)
    expect(matches[0]!.snippet).toContain('121: function computeTotal')
  })

  it('returns zero matches cleanly', () => {
    const { matches, totalMatches } = searchDocs([doc], 'no-such-string', false)
    expect(totalMatches).toBe(0)
    expect(matches).toHaveLength(0)
  })

  it('falls back to literal on an invalid regex', () => {
    const d2 = { name: 'a.txt', text: 'a (b c', truncated: false }
    const { totalMatches } = searchDocs([d2], '(b', true)
    expect(totalMatches).toBe(1)
  })
})
