import { writeFileSync, mkdirSync, rmSync } from 'fs'
import path from 'path'

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  processImageFile,
  isImageFile,
  extractImagePaths,
} from '../utils/image-handler'

const TEST_DIR = path.join(__dirname, 'temp-test-images')
const TEST_IMAGE_PATH = path.join(TEST_DIR, 'test-image.png')
const TEST_LARGE_IMAGE_PATH = path.join(TEST_DIR, 'large-image.jpg')

// Create a minimal PNG file (43 bytes)
const MINIMAL_PNG = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // PNG signature
  0x00,
  0x00,
  0x00,
  0x0d, // IHDR chunk length
  0x49,
  0x48,
  0x44,
  0x52, // IHDR
  0x00,
  0x00,
  0x00,
  0x01, // width: 1
  0x00,
  0x00,
  0x00,
  0x01, // height: 1
  0x08,
  0x02,
  0x00,
  0x00,
  0x00, // bit depth, color type, compression, filter, interlace
  0x90,
  0x77,
  0x53,
  0xde, // CRC
  0x00,
  0x00,
  0x00,
  0x00, // IEND chunk length
  0x49,
  0x45,
  0x4e,
  0x44, // IEND
  0xae,
  0x42,
  0x60,
  0x82, // CRC
])

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(TEST_IMAGE_PATH, MINIMAL_PNG)

  // Create a large fake image (10MB)
  const largeBuffer = Buffer.alloc(10 * 1024 * 1024, 0xff)
  // Add minimal JPEG header
  largeBuffer.writeUInt16BE(0xffd8, 0) // JPEG SOI marker
  largeBuffer.writeUInt16BE(0xffd9, largeBuffer.length - 2) // JPEG EOI marker
  writeFileSync(TEST_LARGE_IMAGE_PATH, largeBuffer)
})

afterEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
})

describe('Image Upload Functionality', () => {
  describe('isImageFile', () => {
    test('should detect valid image extensions', () => {
      expect(isImageFile('test.jpg')).toBe(true)
      expect(isImageFile('test.jpeg')).toBe(true)
      expect(isImageFile('test.png')).toBe(true)
      expect(isImageFile('test.webp')).toBe(true)
      expect(isImageFile('test.gif')).toBe(true)
      expect(isImageFile('test.bmp')).toBe(true)
      expect(isImageFile('test.tiff')).toBe(true)
    })

    test('should reject non-image extensions', () => {
      expect(isImageFile('test.txt')).toBe(false)
      expect(isImageFile('test.js')).toBe(false)
      expect(isImageFile('test.pdf')).toBe(false)
      expect(isImageFile('test')).toBe(false)
    })
  })

  describe('extractImagePaths', () => {
    test('should extract image paths from text with @ syntax', () => {
      const input = 'Look at this @test.png and @image.jpg files'
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['test.png', 'image.jpg'])
    })

    test('should ignore non-image paths', () => {
      const input = 'Check @script.js and @test.png'
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['test.png'])
    })

    test('should return empty array when no image paths found', () => {
      const input = 'No images here @script.js @readme.txt'
      const paths = extractImagePaths(input)
      expect(paths).toEqual([])
    })

    test('should auto-detect absolute paths', () => {
      const input = 'Look at /path/to/image.png and ~/screenshots/photo.jpg'
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['/path/to/image.png', '~/screenshots/photo.jpg'])
    })

    test('should auto-detect relative paths with separators', () => {
      const input = 'Check ./assets/logo.png and ../images/banner.jpg'
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['./assets/logo.png', '../images/banner.jpg'])
    })

    test('should auto-detect quoted paths', () => {
      const input =
        'Files: "./my folder/image.png" and \'../photos/vacation.jpg\''
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['./my folder/image.png', '../photos/vacation.jpg'])
    })

    test('should ignore paths in code blocks', () => {
      const input =
        'See ```./test.png``` and `inline.jpg` but process ./real.png'
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['./real.png'])
    })

    test('should remove trailing punctuation from auto-detected paths', () => {
      const input = 'Look at /path/image.png, and ./other.jpg!'
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['/path/image.png', './other.jpg'])
    })

    test('should deduplicate paths', () => {
      const input = '@test.png and /absolute/test.png and @test.png again'
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['test.png', '/absolute/test.png'])
    })

    test('should NOT auto-detect bare filenames without separators', () => {
      const input = 'Mentioned logo.png and banner.jpg in the text'
      const paths = extractImagePaths(input)
      expect(paths).toEqual([])
    })

    test('should auto-detect bare relative paths with separators', () => {
      const input = 'Check assets/multi-agents.png and images/logo.jpg'
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['assets/multi-agents.png', 'images/logo.jpg'])
    })

    test('should auto-detect Windows-style bare relative paths', () => {
      const input = 'See assets\\windows\\image.png'
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['assets\\windows\\image.png'])
    })

    test('should NOT auto-detect URLs', () => {
      const input =
        'Visit https://example.com/image.png and http://site.com/photo.jpg'
      const paths = extractImagePaths(input)
      expect(paths).toEqual([])
    })

    test('should handle expanded trailing punctuation', () => {
      const input =
        'Files: assets/logo.png), ./images/banner.jpg], and ~/photos/pic.png>'
      const paths = extractImagePaths(input)
      expect(paths.sort()).toEqual(
        ['./images/banner.jpg', '~/photos/pic.png', 'assets/logo.png'].sort(),
      )
    })

    test('should handle weird characters and spaces in quoted paths', () => {
      const input =
        'Files: "./ConstellationFS Demo · 1.21am · 09-11.jpeg" and \'../images/café ñoño (2024).png\''
      const paths = extractImagePaths(input)
      expect(paths).toEqual([
        './ConstellationFS Demo · 1.21am · 09-11.jpeg',
        '../images/café ñoño (2024).png',
      ])
    })

    test('should require quotes for paths with spaces to avoid false positives', () => {
      const input =
        '/Users/brandonchen/Downloads/ConstellationFS Demo · 1.21am · 09-11.jpeg'
      const paths = extractImagePaths(input)
      // Unquoted paths with spaces are not auto-detected to avoid false positives
      expect(paths).toEqual([])
    })

    test('should detect quoted paths with spaces', () => {
      const input = '"/Users/test/My Documents/screenshot file.png"'
      const paths = extractImagePaths(input)
      expect(paths).toEqual(['/Users/test/My Documents/screenshot file.png'])
    })
  })

  describe('processImageFile', () => {
    test('should successfully process a valid image file', async () => {
      const result = await processImageFile(TEST_IMAGE_PATH, TEST_DIR)

      expect(result.success).toBe(true)
      expect(result.imagePart).toBeDefined()
      expect(result.imagePart!.type).toBe('image')
      expect(['image/jpeg', 'image/png']).toContain(result.imagePart!.mediaType) // May be compressed to JPEG
      expect(result.imagePart!.filename).toBe('test-image.png')
      expect(result.imagePart!.image).toMatch(/^[A-Za-z0-9+/]+=*$/) // Base64 regex
    })

    test('should reject file that does not exist', async () => {
      const result = await processImageFile('nonexistent.png', TEST_DIR)

      expect(result.success).toBe(false)
      expect(result.error).toContain('File not found')
    })

    test('should reject files that are too large', async () => {
      const result = await processImageFile(TEST_LARGE_IMAGE_PATH, TEST_DIR)

      expect(result.success).toBe(false)
      expect(result.error).toContain('File too large')
    })

    test('should reject non-image files', async () => {
      const textFilePath = path.join(TEST_DIR, 'test.txt')
      writeFileSync(textFilePath, 'hello world')

      const result = await processImageFile(textFilePath, TEST_DIR)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unsupported image format')
    })

    test('should normalize unicode escape sequences in provided paths', async () => {
      const actualFilename = 'Screenshot 2025-09-29 at 4.09.19 PM.png'
      const filePath = path.join(TEST_DIR, actualFilename)
      writeFileSync(filePath, MINIMAL_PNG)

      const variations = [
        'Screenshot 2025-09-29 at 4.09.19\\u{202f}PM.png',
        'Screenshot 2025-09-29 at 4.09.19\\u202fPM.png',
      ]

      for (const candidate of variations) {
        const result = await processImageFile(candidate, TEST_DIR)
        expect(result.success).toBe(true)
        expect(result.imagePart?.filename).toBe(actualFilename)
      }
    })

    test('should handle shell-escaped characters in paths', async () => {
      const spacedFilename = 'My Screenshot (Final).png'
      const filePath = path.join(TEST_DIR, spacedFilename)
      writeFileSync(filePath, MINIMAL_PNG)

      const result = await processImageFile(
        'My\\ Screenshot\\ (Final).png',
        TEST_DIR,
      )

      expect(result.success).toBe(true)
      expect(result.imagePart?.filename).toBe(spacedFilename)
    })
  })
})
