import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { useChatStore } from '../../state/chat-store'
import type { PendingImageAttachment } from '../../types/store'
import {
  addClipboardPlaceholder,
  addPendingFileFromPath,
  addPendingFileMention,
  addPendingImageFromBase64,
  addPendingImageWithError,
  capturePendingAttachments,
  getFileAttachmentContextMetadata,
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
  let tempDir: string

  beforeEach(() => {
    // Reset the store before each test
    useChatStore.getState().clearPendingAttachments()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-attachments-'))
  })

  afterEach(() => {
    useChatStore.getState().clearPendingAttachments()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  const waitForFileRead = async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const hasProcessingFile = useChatStore
        .getState()
        .pendingAttachments.some(
          (attachment) =>
            attachment.kind === 'file' && attachment.status === 'processing',
        )
      if (!hasProcessingFile) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  describe('file attachment completeness', () => {
    test('marks a complete text file as full with byte provenance', async () => {
      const filePath = path.join(tempDir, 'small.txt')
      fs.writeFileSync(filePath, 'hello')

      addPendingFileFromPath(filePath, false)
      await waitForFileRead()

      const attachment = useChatStore
        .getState()
        .pendingAttachments.find((item) => item.kind === 'file')
      expect(attachment?.status).toBe('ready')
      expect(
        attachment && getFileAttachmentContextMetadata(attachment),
      ).toMatchObject({
        completeness: 'full',
        provenance: 'attachment',
        bytesRead: 5,
        totalBytes: 5,
      })
      expect(attachment?.note).toContain('full')
    })

    test('marks long text as truncated and large files as metadata-only', async () => {
      const longPath = path.join(tempDir, 'long.txt')
      const largePath = path.join(tempDir, 'large.txt')
      fs.writeFileSync(longPath, 'x'.repeat(110 * 1024))
      fs.writeFileSync(largePath, 'x'.repeat(1024 * 1024 + 1))

      addPendingFileFromPath(longPath, false)
      addPendingFileFromPath(largePath, false)
      await waitForFileRead()

      const files = useChatStore
        .getState()
        .pendingAttachments.filter((item) => item.kind === 'file')
      expect(getFileAttachmentContextMetadata(files[0]!)).toMatchObject({
        completeness: 'truncated',
      })
      expect(getFileAttachmentContextMetadata(files[1]!)).toMatchObject({
        completeness: 'metadata-only',
        bytesRead: 0,
      })
    })

    test('records shallow directory bounds', async () => {
      const directoryPath = path.join(tempDir, 'folder')
      fs.mkdirSync(directoryPath)
      for (let index = 0; index < 105; index++) {
        fs.writeFileSync(path.join(directoryPath, `${index}.txt`), '')
      }

      addPendingFileFromPath(directoryPath, true)
      await waitForFileRead()

      const attachment = useChatStore
        .getState()
        .pendingAttachments.find((item) => item.kind === 'file')!
      expect(getFileAttachmentContextMetadata(attachment)).toMatchObject({
        completeness: 'shallow-directory',
        entriesIncluded: 100,
        totalEntries: 105,
      })
      expect(attachment.note).toContain('100/105')
    })

    test('@file selection resolves inside the project with explicit provenance', async () => {
      fs.mkdirSync(path.join(tempDir, 'src'))
      fs.writeFileSync(path.join(tempDir, 'src', 'feature.ts'), 'export {}')

      addPendingFileMention('src/feature.ts', false, tempDir)
      await waitForFileRead()

      const attachment = useChatStore
        .getState()
        .pendingAttachments.find((item) => item.kind === 'file')!
      expect(attachment.path).toBe('src/feature.ts')
      expect(getFileAttachmentContextMetadata(attachment)).toMatchObject({
        completeness: 'full',
        provenance: '@file selection',
      })
    })

    test('@file selection blocks mandatory sensitive paths', async () => {
      fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET=value')

      addPendingFileMention('.env', false, tempDir)
      await waitForFileRead()

      const attachment = useChatStore
        .getState()
        .pendingAttachments.find((item) => item.kind === 'file')!
      expect(attachment.status).toBe('error')
      expect(attachment.content).toBe('')
      expect(attachment.note).toContain('sensitive-file policy')
    })
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
