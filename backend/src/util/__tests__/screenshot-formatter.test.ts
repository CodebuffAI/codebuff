import { createImageBlock } from '../screenshot-formatter'
import { describe, expect, it } from 'bun:test'
import { models } from 'common/constants'

describe('createImageBlock', () => {
  const base64Data = 'base64encodeddata'

  it('should return image block for vision models', () => {
    const result = createImageBlock(base64Data, models.gpt4o)
    expect(result).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: base64Data,
      },
      cache_control: {
        type: 'ephemeral',
      },
    })
  })

  it('should return text block for non-vision models', () => {
    const result = createImageBlock(base64Data, models.o3mini)
    expect(result).toEqual({
      type: 'text',
      text: base64Data,
    })
  })
})
