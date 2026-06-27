import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { appendBlock, MAX_ATTACHMENTS } from '../core/attachments'
import { buildAttachmentBlock } from './attachments'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'fbd-att-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('buildAttachmentBlock', () => {
  test('inlines a text file and summarizes it', () => {
    const { dir, cleanup } = fixture()
    try {
      const file = join(dir, 'notes.txt')
      writeFileSync(file, 'hello world')
      const { promptBlock, manifest, summary } = buildAttachmentBlock([file])
      expect(promptBlock).toContain(`[File: ${file}]`)
      expect(promptBlock).toContain('hello world')
      expect(manifest).toEqual([{ name: 'notes.txt', kind: 'file' }])
      expect(summary).toBe('📎 notes.txt')
    } finally {
      cleanup()
    }
  })

  test('inlineImages: sends a vision-friendly image as base64 content', () => {
    const { dir, cleanup } = fixture()
    try {
      const img = join(dir, 'photo.png')
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3])
      writeFileSync(img, bytes)
      const { promptBlock, manifest, summary, images } = buildAttachmentBlock([img], { inlineImages: true })
      expect(promptBlock).toContain(`[Image: ${img}]`)
      expect(promptBlock).toContain('Attached to this message')
      expect(manifest).toEqual([{ name: 'photo.png', kind: 'image' }])
      expect(summary).toBe('📎 photo.png')
      // The bytes are handed to the model as base64 image content.
      expect(images).toEqual([{ image: bytes.toString('base64'), mediaType: 'image/png' }])
    } finally {
      cleanup()
    }
  })

  test('without inlineImages: references the image by path, no base64', () => {
    const { dir, cleanup } = fixture()
    try {
      const img = join(dir, 'photo.png')
      writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]))
      const { promptBlock, images } = buildAttachmentBlock([img])
      // Claude Code path: no false "it's attached" claim, no wasted base64 read.
      expect(promptBlock).toContain('view the image')
      expect(images).toEqual([])
    } finally {
      cleanup()
    }
  })

  test('a non-vision image format (heic) is never inlined, even with inlineImages', () => {
    const { dir, cleanup } = fixture()
    try {
      const img = join(dir, 'photo.heic')
      writeFileSync(img, Buffer.from([0, 1, 2, 3]))
      const { promptBlock, manifest, images } = buildAttachmentBlock([img], { inlineImages: true })
      expect(promptBlock).toContain(`[Image: ${img}]`)
      expect(promptBlock).toContain('view the image')
      expect(manifest).toEqual([{ name: 'photo.heic', kind: 'image' }])
      expect(images).toEqual([])
    } finally {
      cleanup()
    }
  })

  test('lists a directory (folders first) and marks it as a directory', () => {
    const { dir, cleanup } = fixture()
    try {
      const sub = join(dir, 'proj')
      mkdirSync(join(sub, 'src'), { recursive: true })
      writeFileSync(join(sub, 'a.ts'), 'a')
      const { promptBlock, manifest, summary } = buildAttachmentBlock([sub])
      expect(promptBlock).toContain(`[Directory: ${sub}]`)
      // Directories sort before files.
      expect(promptBlock).toContain('src/\na.ts')
      expect(manifest).toEqual([{ name: 'proj', kind: 'directory' }])
      expect(summary).toBe('📎 proj/')
    } finally {
      cleanup()
    }
  })

  test('skips missing paths but keeps the readable ones', () => {
    const { dir, cleanup } = fixture()
    try {
      const file = join(dir, 'real.md')
      writeFileSync(file, '# real')
      const { manifest, summary } = buildAttachmentBlock([join(dir, 'ghost.txt'), file])
      expect(manifest).toEqual([{ name: 'real.md', kind: 'file' }])
      expect(summary).toBe('📎 real.md')
    } finally {
      cleanup()
    }
  })

  test('flags a binary file rather than inlining it', () => {
    const { dir, cleanup } = fixture()
    try {
      const bin = join(dir, 'blob.dat')
      writeFileSync(bin, Buffer.from([0, 1, 2, 0, 3]))
      const { promptBlock, manifest } = buildAttachmentBlock([bin])
      expect(promptBlock).toContain('binary file')
      expect(manifest).toEqual([{ name: 'blob.dat', kind: 'file' }])
    } finally {
      cleanup()
    }
  })

  test('empty input yields no block', () => {
    expect(buildAttachmentBlock([])).toEqual({ promptBlock: '', manifest: [], summary: '', images: [] })
  })

  test('caps the number of attachments read', () => {
    const { dir, cleanup } = fixture()
    try {
      const paths = Array.from({ length: MAX_ATTACHMENTS + 5 }, (_, i) => {
        const p = join(dir, `f${i}.txt`)
        writeFileSync(p, `file ${i}`)
        return p
      })
      const { manifest } = buildAttachmentBlock(paths)
      expect(manifest).toHaveLength(MAX_ATTACHMENTS)
    } finally {
      cleanup()
    }
  })
})

describe('appendBlock', () => {
  test('joins text and block with a blank line', () => {
    expect(appendBlock('look', '📎 a.txt')).toBe('look\n\n📎 a.txt')
  })
  test('returns the block alone when text is blank', () => {
    expect(appendBlock('   ', '📎 a.txt')).toBe('📎 a.txt')
  })
  test('returns trimmed text when there is no block', () => {
    expect(appendBlock('  hi  ', '')).toBe('hi')
  })
})
