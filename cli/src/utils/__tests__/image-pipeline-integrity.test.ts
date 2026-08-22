import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { Jimp } from 'jimp'

import { setProjectRoot } from '../../project-files'
import { processImageFile } from '../image-handler'
import { MAX_IMAGE_BASE64_SIZE } from '@codebuff/common/constants/images'

// Mock the logger to prevent analytics initialization errors in tests
mock.module('../logger', () => ({
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  },
}))

let TEST_DIR: string

beforeEach(async () => {
  TEST_DIR = mkdtempSync(path.join(os.tmpdir(), 'cli-image-integrity-'))
  mkdirSync(path.join(TEST_DIR, 'debug'), { recursive: true })
  setProjectRoot(TEST_DIR)
})

afterEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
})

/** Fill an image with high-entropy content so its PNG encoding is large
 *  enough to exercise the compression path. */
function addNoise(image: InstanceType<typeof Jimp>, amount = 0.9): void {
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
    if (Math.random() < amount) {
      image.bitmap.data[idx] = Math.floor(Math.random() * 256)
      image.bitmap.data[idx + 1] = Math.floor(Math.random() * 256)
      image.bitmap.data[idx + 2] = Math.floor(Math.random() * 256)
      // Leave alpha as-is
    }
  })
}

describe('image pipeline integrity', () => {
  test('small PNG passes through byte-identical and decodes', async () => {
    const image = new Jimp({ width: 200, height: 100, color: 0x1e90ffff })
    // Draw a readable "UI-like" pattern: white bar + dark text-like stripes
    image.scan(0, 0, 200, 100, (x, y, idx) => {
      if (x >= 20 && x < 180 && y >= 30 && y < 70) {
        image.bitmap.data[idx] = 0xff
        image.bitmap.data[idx + 1] = 0xff
        image.bitmap.data[idx + 2] = 0xff
      }
    })
    const filePath = path.join(TEST_DIR, 'small-200x100.png') as `${string}.${string}`
    await image.write(filePath)
    const originalBytes = readFileSync(filePath)

    const result = await processImageFile('small-200x100.png', TEST_DIR)

    expect(result.success).toBe(true)
    expect(result.imagePart).toBeDefined()
    expect(result.wasCompressed).toBe(false)

    const part = result.imagePart!
    expect(part.width).toBe(200)
    expect(part.height).toBe(100)
    expect(part.mediaType).toBe('image/png')

    // The passthrough path must not mutate the payload.
    const decoded = Buffer.from(part.image, 'base64')
    expect(decoded.equals(originalBytes)).toBe(true)

    // And it must re-decode as a valid PNG with the right dimensions.
    const reread = await Jimp.read(decoded)
    expect(reread.bitmap.width).toBe(200)
    expect(reread.bitmap.height).toBe(100)
  })

  test('large noisy image is compressed to a valid JPEG that still decodes', async () => {
    // 1600x1600 noise produces a PNG far above MAX_IMAGE_BASE64_SIZE.
    const image = new Jimp({ width: 1600, height: 1600, color: 0x000000ff })
    addNoise(image)
    const filePath = path.join(TEST_DIR, 'big-noisy.png') as `${string}.${string}`
    await image.write(filePath)

    const originalBase64 = readFileSync(filePath).toString('base64')
    expect(originalBase64.length).toBeGreaterThan(MAX_IMAGE_BASE64_SIZE)

    const result = await processImageFile('big-noisy.png', TEST_DIR)

    expect(result.success).toBe(true)
    expect(result.wasCompressed).toBe(true)
    const part = result.imagePart!
    expect(part.mediaType).toBe('image/jpeg')
    expect(part.image.length).toBeLessThanOrEqual(MAX_IMAGE_BASE64_SIZE)
    expect(part.width).toBeDefined()
    expect(part.height).toBeDefined()

    // The compressed payload must decode as a real JPEG.
    const decoded = Buffer.from(part.image, 'base64')
    expect(decoded[0]).toBe(0xff)
    expect(decoded[1]).toBe(0xd8)

    const reread = await Jimp.read(decoded)
    // Aspect ratio preserved (1600x1600 → square at reduced dimension).
    expect(reread.bitmap.width).toBe(reread.bitmap.height)
    expect(reread.bitmap.width).toBe(part.width!)
    expect(reread.bitmap.height).toBe(part.height!)
    // Resized to the largest dimension that fit the budget.
    expect(reread.bitmap.width).toBeGreaterThan(0)
    expect(reread.bitmap.width).toBeLessThanOrEqual(1600)

    // Content must survive: average luminance should stay high (noise).
    let sum = 0
    let count = 0
    reread.scan(0, 0, reread.bitmap.width, reread.bitmap.height, (_x, _y, idx) => {
      sum += reread.bitmap.data[idx]
      count++
    })
    const avg = sum / count
    expect(avg).toBeGreaterThan(30)
    expect(avg).toBeLessThan(235)
  })

  test('landscape compression preserves aspect ratio', async () => {
    const image = new Jimp({ width: 2400, height: 1200, color: 0x00ff00ff })
    addNoise(image, 0.7)
    const filePath = path.join(TEST_DIR, 'wide-2400x1200.png') as `${string}.${string}`
    await image.write(filePath)

    const result = await processImageFile('wide-2400x1200.png', TEST_DIR)
    expect(result.success).toBe(true)
    expect(result.wasCompressed).toBe(true)

    const reread = await Jimp.read(Buffer.from(result.imagePart!.image, 'base64'))
    expect(reread.bitmap.width / reread.bitmap.height).toBeCloseTo(2, 1)
  })

  test('portrait compression preserves aspect ratio', async () => {
    const image = new Jimp({ width: 1200, height: 2400, color: 0xff0000ff })
    addNoise(image, 0.7)
    const filePath = path.join(TEST_DIR, 'tall-1200x2400.png') as `${string}.${string}`
    await image.write(filePath)

    const result = await processImageFile('tall-1200x2400.png', TEST_DIR)
    expect(result.success).toBe(true)
    expect(result.wasCompressed).toBe(true)

    const reread = await Jimp.read(Buffer.from(result.imagePart!.image, 'base64'))
    expect(reread.bitmap.height / reread.bitmap.width).toBeCloseTo(2, 1)
  })

  test('transparent PNG is compressed without crashing and keeps dimensions', async () => {
    const image = new Jimp({ width: 800, height: 600, color: 0x00000000 })
    // Transparent background with a small opaque shape — common for pasted
    // UI elements; JPEG re-encode must still produce a decodable image.
    image.scan(0, 0, 800, 600, (x, y, idx) => {
      if (x > 100 && x < 300 && y > 100 && y < 300) {
        image.bitmap.data[idx] = 0x00
        image.bitmap.data[idx + 1] = 0x80
        image.bitmap.data[idx + 2] = 0xff
        image.bitmap.data[idx + 3] = 0xff
      }
    })
    const filePath = path.join(TEST_DIR, 'alpha-800x600.png') as `${string}.${string}`
    await image.write(filePath)

    const result = await processImageFile('alpha-800x600.png', TEST_DIR)
    expect(result.success).toBe(true)
    if (result.wasCompressed) {
      const part = result.imagePart!
      const reread = await Jimp.read(Buffer.from(part.image, 'base64'))
      expect(reread.bitmap.width).toBe(part.width!)
      expect(reread.bitmap.height).toBe(part.height!)
    }
  })

  test('jpeg input is accepted and re-encodes validly when compressed', async () => {
    const image = new Jimp({ width: 1400, height: 900, color: 0x808080ff })
    addNoise(image, 0.8)
    const filePath = path.join(TEST_DIR, 'photo-1400x900.jpg') as `${string}.${string}`
    await image.write(filePath)

    const result = await processImageFile('photo-1400x900.jpg', TEST_DIR)
    expect(result.success).toBe(true)
    const part = result.imagePart!
    expect(part.mediaType).toBe('image/jpeg')

    const reread = await Jimp.read(Buffer.from(part.image, 'base64'))
    expect(reread.bitmap.width).toBe(part.width!)
    expect(reread.bitmap.height).toBe(part.height!)
  })

  test('oversized file is rejected with a clear error, not corrupted', async () => {
    // MAX_IMAGE_FILE_SIZE is 10MB; write a file that exceeds it and confirm
    // we get a descriptive error instead of a silent failure.
    const bigPath = path.join(TEST_DIR, 'huge.png')
    const chunk = Buffer.alloc(1024 * 1024, 0x89)
    writeFileSync(bigPath, Buffer.concat(Array(11).fill(chunk)))

    const result = await processImageFile('huge.png', TEST_DIR)
    expect(result.success).toBe(false)
    expect(result.error).toContain('too large')
  })
})
