import { describe, expect, test, mock } from 'bun:test'

import { processImagesForMessage } from '../image-processor'

import type { PendingImageAttachment } from '../../types/store'

// Type for the processor function used in tests
type ProcessorResult = 
  | { success: true; imagePart: { type: 'image'; image: string; mediaType: string } }
  | { success: false; error: string }
type MockProcessor = (path: string, projectRoot: string) => Promise<ProcessorResult>

// Minimal logger type for tests - only need warn for these tests
interface TestLogger {
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  fatal: (...args: unknown[]) => void
}

const createPendingImage = (path: string, processedImage?: { base64: string; mediaType: string }): PendingImageAttachment => ({
  kind: 'image',
  path,
  filename: path.split('/').pop() ?? 'image.png',
  status: 'ready',
  ...(processedImage && { processedImage }),
})

describe('processImagesForMessage', () => {
  test('uses pre-processed image data from pendingImages without re-reading from disk', async () => {
    const pendingImages = [createPendingImage('/tmp/pic.png', {
      base64: 'pre-processed-base64-data',
      mediaType: 'image/png',
    })]
    const processor = mock(async () => ({
      success: true,
      imagePart: {
        type: 'image' as const,
        image: 'disk-base64-data',
        mediaType: 'image/png',
      },
    }))

    const result = await processImagesForMessage({
      content: 'Here is an image @/tmp/pic.png',
      pendingImages,
      projectRoot: '/repo',
      processor: processor as MockProcessor,
    })

    // Should NOT call processor since we have pre-processed data
    expect(processor).not.toHaveBeenCalled()
    expect(result.attachments).toHaveLength(1)
    expect(result.messageContent?.[0]).toMatchObject({
      type: 'image',
      image: 'pre-processed-base64-data',
      mediaType: 'image/png',
    })
  })

  test('processes inline image paths that are not in pendingImages', async () => {
    const pendingImages = [createPendingImage('/tmp/pic.png', {
      base64: 'pre-processed-base64-data',
      mediaType: 'image/png',
    })]
    const processor = mock(async () => ({
      success: true,
      imagePart: {
        type: 'image' as const,
        image: 'inline-base64-data',
        mediaType: 'image/jpeg',
      },
    }))

    const result = await processImagesForMessage({
      content: 'Here is another image @/tmp/other.jpg',
      pendingImages,
      projectRoot: '/repo',
      processor: processor as MockProcessor,
    })

    // Should call processor only for the inline path
    expect(processor).toHaveBeenCalledTimes(1)
    expect(processor).toHaveBeenCalledWith('/tmp/other.jpg', '/repo')
    expect(result.messageContent).toHaveLength(2)
    expect(result.messageContent?.[0]).toMatchObject({
      type: 'image',
      image: 'pre-processed-base64-data',
    })
    expect(result.messageContent?.[1]).toMatchObject({
      type: 'image',
      image: 'inline-base64-data',
    })
  })

  test('backwards compatibility: processes from disk when processedImage is missing', async () => {
    // This tests the edge case where processedImage is missing but status is 'ready'
    const pendingImages = [createPendingImage('/tmp/pic.png')] // No processedImage
    const warn = mock(() => {})
    const processor = mock(async () => ({
      success: true,
      imagePart: {
        type: 'image' as const,
        image: 'disk-base64-data',
        mediaType: 'image/png',
      },
    }))

    const result = await processImagesForMessage({
      content: '',
      pendingImages,
      projectRoot: '/repo',
      processor: processor as MockProcessor,
      log: { warn, error: () => {}, debug: () => {}, info: () => {}, fatal: () => {} } as TestLogger,
    })

    // Should warn about missing processedImage and fall back to disk
    expect(warn).toHaveBeenCalled()
    expect(processor).toHaveBeenCalledTimes(1)
    expect(result.messageContent?.[0]).toMatchObject({
      type: 'image',
      image: 'disk-base64-data',
    })
  })

  test('skips images with processing or error status', async () => {
    const pendingImages: PendingImageAttachment[] = [
      { kind: 'image', path: '/tmp/processing.png', filename: 'processing.png', status: 'processing' },
      { kind: 'image', path: '/tmp/error.png', filename: 'error.png', status: 'error', note: 'failed' },
      createPendingImage('/tmp/ready.png', { base64: 'ready-data', mediaType: 'image/png' }),
    ]
    const processor = mock(async () => ({
      success: true,
      imagePart: {
        type: 'image' as const,
        image: 'should-not-be-used',
        mediaType: 'image/png',
      },
    }))

    const result = await processImagesForMessage({
      content: '',
      pendingImages,
      projectRoot: '/repo',
      processor: processor as MockProcessor,
    })

    // Should not call processor at all (ready image has processedImage)
    expect(processor).not.toHaveBeenCalled()
    // Only the ready image should be in messageContent
    expect(result.messageContent).toHaveLength(1)
    expect(result.messageContent?.[0]).toMatchObject({
      type: 'image',
      image: 'ready-data',
    })
  })

  test('logs warnings when inline path processing fails', async () => {
    const warn = mock(() => {})
    const pendingImages: PendingImageAttachment[] = []
    const processor = mock(async () => ({
      success: false,
      error: 'boom',
    }))

    const result = await processImagesForMessage({
      content: 'Here is an image @/tmp/fail.png',
      pendingImages,
      projectRoot: '/repo',
      processor: processor as MockProcessor,
      log: { warn, error: () => {}, debug: () => {}, info: () => {}, fatal: () => {} } as TestLogger,
    })

    expect(warn).toHaveBeenCalled()
    expect(result.messageContent).toBeUndefined()
  })

  test('deduplicates: does not process inline path that matches pending image path', async () => {
    const pendingImages = [createPendingImage('/tmp/pic.png', {
      base64: 'pre-processed-data',
      mediaType: 'image/png',
    })]
    const processor = mock(async () => ({
      success: true,
      imagePart: {
        type: 'image' as const,
        image: 'disk-data',
        mediaType: 'image/png',
      },
    }))

    const result = await processImagesForMessage({
      content: 'Here is the same image @/tmp/pic.png and again /tmp/pic.png',
      pendingImages,
      projectRoot: '/repo',
      processor: processor as MockProcessor,
    })

    // Should not call processor since the path is already in pendingImages
    expect(processor).not.toHaveBeenCalled()
    // Should only have one image in messageContent (no duplicates)
    expect(result.messageContent).toHaveLength(1)
    expect(result.messageContent?.[0]).toMatchObject({
      type: 'image',
      image: 'pre-processed-data',
    })
  })
})
