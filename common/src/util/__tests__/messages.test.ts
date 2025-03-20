import { describe, expect, it } from 'bun:test'
import { limitScreenshots } from '../messages'
import { Message } from '../../types/message'

describe('limitScreenshots', () => {
  const createImageContent = (id: number) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: `base64data${id}`,
    },
  })

  const createTextContent = (text: string) => ({
    type: 'text' as const,
    text,
  })

  it('should return messages unchanged when no screenshots present', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: [createTextContent('world')] },
    ]
    expect(limitScreenshots(messages, 2)).toEqual(messages)
  })

  it('should return messages unchanged when screenshots under limit', () => {
    const messages: Message[] = [
      { role: 'user', content: [createImageContent(1)] },
      { role: 'assistant', content: [createImageContent(2)] },
    ]
    expect(limitScreenshots(messages, 2)).toEqual(messages)
  })

  it('should keep only most recent screenshots when over limit', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [createImageContent(1), createTextContent('hello')],
      },
      {
        role: 'assistant',
        content: [createImageContent(2), createImageContent(3)],
      },
    ]
    const result = limitScreenshots(messages, 2)
    const images = result.flatMap(msg =>
      Array.isArray(msg.content)
        ? msg.content.filter(item => item.type === 'image')
        : []
    )
    expect(images).toHaveLength(2)
    expect(images[0]).toEqual(createImageContent(2))
    expect(images[1]).toEqual(createImageContent(3))
  })

  it('should preserve non-image content when filtering', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [createImageContent(1), createTextContent('hello')],
      },
      {
        role: 'assistant',
        content: [createImageContent(2), createTextContent('world')],
      },
    ]
    const result = limitScreenshots(messages, 1)
    expect(result[0].content).toEqual([createTextContent('hello')])
    expect(result[1].content).toEqual([
      createImageContent(2),
      createTextContent('world'),
    ])
  })
})
