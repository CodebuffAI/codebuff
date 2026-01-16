import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  useChatStore,
  type PendingImageAttachment,
} from '../../state/chat-store'
import {
  addClipboardPlaceholder,
  addPendingImageFromBase64,
  addPendingImageWithError,
  capturePendingAttachments,
} from '../pending-attachments'

/** Helper to get only image attachments from the unified pendingAttachments array */
function getPendingImages(): PendingImageAttachment[] {
  return useChatStore
    .getState()
    .pendingAttachments.filter(
      (att): att is PendingImageAttachment => att.kind === 'image',
    )
}

describe('pending-attachments', () => {
  beforeEach(() => {
    // Reset the store before each test
    useChatStore.getState().clearPendingAttachments()
  })

  afterEach(() => {
    useChatStore.getState().clearPendingAttachments()
  })

  describe('addClipboardPlaceholder', () => {
    test('creates placeholder with processing status', () => {
      const placeholderPath = addClipboardPlaceholder()

      const pendingImages = getPendingImages()
      expect(pendingImages).toHaveLength(1)
      expect(pendingImages[0].path).toBe(placeholderPath)
      expect(pendingImages[0].status).toBe('processing')
      expect(pendingImages[0].filename).toBe('clipboard image')
    })

    test('generates unique placeholder paths', () => {
      const path1 = addClipboardPlaceholder()
      const path2 = addClipboardPlaceholder()

      expect(path1).not.toBe(path2)
      expect(path1).toContain('clipboard:pending-')
      expect(path2).toContain('clipboard:pending-')
    })

    test('multiple placeholders coexist in store', () => {
      addClipboardPlaceholder()
      addClipboardPlaceholder()
      addClipboardPlaceholder()

      const pendingImages = getPendingImages()
      expect(pendingImages).toHaveLength(3)
      expect(pendingImages.every((img) => img.status === 'processing')).toBe(
        true,
      )
    })
  })

  describe('addPendingImageFromBase64', () => {
    test('adds image with ready status', async () => {
      await addPendingImageFromBase64(
        'base64data',
        'image/png',
        'test.png',
        '/tmp/test.png',
      )

      const pendingImages = getPendingImages()
      expect(pendingImages).toHaveLength(1)
      expect(pendingImages[0].status).toBe('ready')
      expect(pendingImages[0].filename).toBe('test.png')
      expect(pendingImages[0].processedImage?.base64).toBe('base64data')
      expect(pendingImages[0].processedImage?.mediaType).toBe('image/png')
    })

    test('uses clipboard path when tempPath not provided', async () => {
      await addPendingImageFromBase64('base64data', 'image/png', 'test.png')

      const pendingImages = getPendingImages()
      expect(pendingImages[0].path).toBe('clipboard:test.png')
    })

    test('calculates approximate size from base64', async () => {
      const base64Data = 'a'.repeat(1000) // 1000 base64 chars
      await addPendingImageFromBase64(base64Data, 'image/png', 'test.png')

      const pendingImages = getPendingImages()
      // Size should be approximately 750 bytes (3/4 of 1000)
      expect(pendingImages[0].size).toBe(750)
    })
  })

  describe('addPendingImageWithError', () => {
    test('adds image with error status', () => {
      addPendingImageWithError('/path/to/image.png', '❌ file not found')

      const pendingImages = getPendingImages()
      expect(pendingImages).toHaveLength(1)
      expect(pendingImages[0].status).toBe('error')
      expect(pendingImages[0].note).toBe('❌ file not found')
      expect(pendingImages[0].filename).toBe('image.png')
    })
  })

  describe('capturePendingAttachments', () => {
    test('returns and clears all pending attachments', () => {
      addClipboardPlaceholder()
      addClipboardPlaceholder()

      expect(getPendingImages()).toHaveLength(2)

      const captured = capturePendingAttachments()

      expect(captured).toHaveLength(2)
      expect(getPendingImages()).toHaveLength(0)
    })

    test('returns empty array when no pending attachments', () => {
      const captured = capturePendingAttachments()
      expect(captured).toHaveLength(0)
    })
  })

  describe('placeholder replacement flow', () => {
    test('placeholder can be updated via setState', () => {
      const placeholderPath = addClipboardPlaceholder()

      // Simulate what addPendingImageFromFile does when replacing placeholder
      useChatStore.setState((state) => ({
        pendingAttachments: state.pendingAttachments.map((att) =>
          att.kind === 'image' && att.path === placeholderPath
            ? { ...att, path: '/real/path.png', filename: 'screenshot.png' }
            : att,
        ),
      }))

      const pendingImages = getPendingImages()
      expect(pendingImages).toHaveLength(1)
      expect(pendingImages[0].path).toBe('/real/path.png')
      expect(pendingImages[0].filename).toBe('screenshot.png')
      expect(pendingImages[0].status).toBe('processing') // Still processing
    })

    test('status transitions from processing to ready', () => {
      const placeholderPath = addClipboardPlaceholder()

      // Simulate processing completion
      useChatStore.setState((state) => ({
        pendingAttachments: state.pendingAttachments.map((att) =>
          att.kind === 'image' && att.path === placeholderPath
            ? {
                ...att,
                status: 'ready' as const,
                processedImage: { base64: 'data', mediaType: 'image/png' },
              }
            : att,
        ),
      }))

      const pendingImages = getPendingImages()
      expect(pendingImages[0].status).toBe('ready')
      expect(pendingImages[0].processedImage).toBeDefined()
    })

    test('status transitions from processing to error', () => {
      const placeholderPath = addClipboardPlaceholder()

      // Simulate processing failure
      useChatStore.setState((state) => ({
        pendingAttachments: state.pendingAttachments.map((att) =>
          att.kind === 'image' && att.path === placeholderPath
            ? { ...att, status: 'error' as const, note: 'Processing failed' }
            : att,
        ),
      }))

      const pendingImages = getPendingImages()
      expect(pendingImages[0].status).toBe('error')
      expect(pendingImages[0].note).toBe('Processing failed')
    })
  })

  describe('mixed status scenarios', () => {
    test('can have images in different states simultaneously', async () => {
      // Add a processing placeholder
      const placeholder = addClipboardPlaceholder()

      // Add a ready image
      await addPendingImageFromBase64(
        'data',
        'image/png',
        'ready.png',
        '/ready.png',
      )

      // Add an error image
      addPendingImageWithError('/error.png', '❌ error')

      const pendingImages = getPendingImages()
      expect(pendingImages).toHaveLength(3)

      const processing = pendingImages.find((img) => img.path === placeholder)
      const ready = pendingImages.find((img) => img.path === '/ready.png')
      const error = pendingImages.find((img) => img.path === '/error.png')

      expect(processing?.status).toBe('processing')
      expect(ready?.status).toBe('ready')
      expect(error?.status).toBe('error')
    })

    test('counting by status works correctly', () => {
      // Add 2 processing, 3 ready, 1 error
      addClipboardPlaceholder()
      addClipboardPlaceholder()

      useChatStore.getState().addPendingImage({
        path: '/ready1.png',
        filename: 'ready1.png',
        status: 'ready',
      })
      useChatStore.getState().addPendingImage({
        path: '/ready2.png',
        filename: 'ready2.png',
        status: 'ready',
      })
      useChatStore.getState().addPendingImage({
        path: '/ready3.png',
        filename: 'ready3.png',
        status: 'ready',
      })

      addPendingImageWithError('/error.png', '❌ error')

      const pendingImages = getPendingImages()
      const processingCount = pendingImages.filter(
        (img) => img.status === 'processing',
      ).length
      const readyCount = pendingImages.filter(
        (img) => img.status === 'ready',
      ).length
      const errorCount = pendingImages.filter(
        (img) => img.status === 'error',
      ).length

      expect(processingCount).toBe(2)
      expect(readyCount).toBe(3)
      expect(errorCount).toBe(1)
    })
  })

  describe('removePendingImage', () => {
    test('removes placeholder by path', () => {
      const placeholderPath = addClipboardPlaceholder()
      expect(getPendingImages()).toHaveLength(1)

      useChatStore.getState().removePendingImage(placeholderPath)
      expect(getPendingImages()).toHaveLength(0)
    })

    test('only removes matching path', () => {
      const path1 = addClipboardPlaceholder()
      const path2 = addClipboardPlaceholder()
      expect(getPendingImages()).toHaveLength(2)

      useChatStore.getState().removePendingImage(path1)

      const remaining = getPendingImages()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].path).toBe(path2)
    })
  })
})
