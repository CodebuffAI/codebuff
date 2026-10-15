import { describe, expect, test } from 'bun:test'

import {
  PROJECT_UNDERSTANDING_NON_TEXT_EXTENSIONS,
  isProjectUnderstandingNonTextPath,
  looksLikeBinaryContent,
} from '../non-text-files'
import { languageForPath, shouldCountLines } from '../stats'

describe('isProjectUnderstandingNonTextPath', () => {
  test('refuses images, documents, archives, media, fonts, binaries and databases', () => {
    for (const path of [
      'logo.png',
      'assets/photo.JPG',
      'docs/spec.pdf',
      'release.tar.gz',
      'lib/app.jar',
      'slides.pptx',
      'clip.mov',
      'fonts/Inter.woff2',
      'bin/tool.exe',
      'build/native.dylib',
      'cache/mod.pyc',
      'data/app.sqlite3',
      'local.db',
      'installer.dmg',
      'C:\\repo\\icon.ico',
    ]) {
      expect(isProjectUnderstandingNonTextPath(path)).toBe(true)
    }
  })

  test('allows text and code, including SVG and dotfiles', () => {
    for (const path of [
      'src/index.ts',
      'icon.svg',
      'package.json',
      'Dockerfile',
      '.gitignore',
      'README.md',
      'schema.prisma',
      'main.tf',
    ]) {
      expect(isProjectUnderstandingNonTextPath(path)).toBe(false)
    }
  })

  test('no refused extension is a counted language, so counting never opens one', () => {
    for (const extension of PROJECT_UNDERSTANDING_NON_TEXT_EXTENSIONS) {
      expect(languageForPath(`file${extension}`)).toBeNull()
      expect(shouldCountLines(`file${extension}`)).toBe(false)
    }
  })
})

describe('looksLikeBinaryContent', () => {
  test('a NUL in the first 4 KB is binary, as bytes or decoded text', () => {
    expect(looksLikeBinaryContent(new Uint8Array([0x50, 0x4b, 0x00, 0x01]))).toBe(true)
    expect(looksLikeBinaryContent('abc\u0000def')).toBe(true)
  })

  test('text, and a NUL only past 4 KB, are not', () => {
    expect(looksLikeBinaryContent('const a = 1\n')).toBe(false)
    expect(looksLikeBinaryContent(new TextEncoder().encode('hello'))).toBe(false)
    expect(looksLikeBinaryContent(`${'a'.repeat(5000)}\u0000`)).toBe(false)
  })
})
