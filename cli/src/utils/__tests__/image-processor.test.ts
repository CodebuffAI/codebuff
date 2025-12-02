import { describe, expect, test, mock } from 'bun:test'

import { processImagesForMessage } from '../image-processor'

import type { PendingImage } from '../../state/chat-store'

const createPendingImage = (path: string): PendingImage => ({
  path,
  filename: path.split('/').pop() ?? 'image.png',
  status: 'ready',
})

describe('processImagesForMessage', () => {
  test('deduplicates image paths and returns message content', async () => {
    const pendingImages = [createPendingImage('/tmp/pic.png')]
    const processor = mock(async () => ({
      success: true,
      imagePart: {
        type: 'image' as const,
        image: 'base64-data',
        mediaType: 'image/png',
      },
    }))

    const result = await processImagesForMessage({
      content: 'Here is an image @/tmp/pic.png',
      pendingImages,
      projectRoot: '/repo',
      processor: processor as any,
    })

    expect(processor).toHaveBeenCalledTimes(1)
    expect(result.attachments).toHaveLength(1)
    expect(result.messageContent?.[0]).toMatchObject({
      type: 'image',
      image: 'base64-data',
    })
  })

  test('logs warnings when processing fails', async () => {
    const warn = mock(() => {})
    const pendingImages = [createPendingImage('/tmp/fail.png')]
    const processor = mock(async () => ({
      success: false,
      error: 'boom',
    }))

    const result = await processImagesForMessage({
      content: '',
      pendingImages,
      projectRoot: '/repo',
      processor: processor as any,
      log: { warn } as any,
    })

    expect(warn).toHaveBeenCalled()
    expect(result.messageContent).toBeUndefined()
  })
})
