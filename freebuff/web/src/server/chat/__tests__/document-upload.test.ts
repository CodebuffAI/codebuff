import { describe, expect, it } from 'bun:test'

import { classifyAttachment } from '@/app/chat/models'
import { searchDocs } from '@/server/chat/document-context'
import {
  EmptyDocumentError,
  extractText,
  parseDelimited,
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

describe('parseDelimited', () => {
  it('parses quoted fields with embedded delimiters, newlines, and "" escapes', () => {
    const csv = 'a,b,c\n1,"x,y","line1\nline2"\n2,"he said ""hi""",z'
    expect(parseDelimited(csv, ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x,y', 'line1\nline2'],
      ['2', 'he said "hi"', 'z'],
    ])
  })
  it('handles CRLF and tabs', () => {
    expect(parseDelimited('a\tb\r\nc\td', '\t')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('extractText — tables (Phase 3)', () => {
  async function readFixture(name: string): Promise<ArrayBuffer> {
    const u8 = await Bun.file(`${import.meta.dir}/fixtures/${name}`).bytes()
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
  }

  it('renders a CSV as a Markdown table', async () => {
    const csv = 'Region,Revenue,Notes\nWest,1200,"a, b"\nEast,980,steady\n'
    const r = await extractText({
      bytes: bytesOf(csv),
      mediaType: 'text/csv',
      fileName: 'data.csv',
    })
    expect(r.text).toContain('| Region | Revenue | Notes |')
    expect(r.text).toContain('| --- | --- | --- |')
    // The comma inside the quoted field stays in one cell (not split).
    expect(r.text).toContain('| East | 980 | steady |')
    expect(r.text).toContain('a, b')
  })

  it('extracts an XLSX as a Markdown table', async () => {
    const r = await extractText({
      bytes: await readFixture('sample.xlsx'),
      mediaType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: 'sample.xlsx',
    })
    expect(r.text).toContain('| Region | Revenue | Notes |')
    expect(r.text).toContain('XLSX_SECRET_42')
    expect(r.text).toContain('| West | 1200 |')
  })

  it('preserves a table when extracting a DOCX', async () => {
    const r = await extractText({
      bytes: await readFixture('sample-table.docx'),
      mediaType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'sample-table.docx',
    })
    expect(r.text).toContain('DOCX_TABLE_77')
    // GFM table pipes survive (mammoth → HTML → turndown+gfm).
    expect(r.text).toContain('| Region | Revenue |')
  })

  it('rejects a corrupt XLSX', async () => {
    await expect(
      extractText({
        bytes: bytesOf('PK not really xlsx'),
        mediaType: 'application/vnd.ms-excel',
        fileName: 'bad.xlsx',
      }),
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
