export async function* processStreamWithTags<T extends string>(
  stream: AsyncGenerator<T>,
  tags: {
    [tagName: string]: {
      attributeNames: string[]
      onTagStart: (attributes: Record<string, string>) => void
      onTagEnd: (content: string, attributes: Record<string, string>) => boolean
    }
  }
) {
  let buffer = ''
  let insideTag: string | null = null
  let currentAttributes: Record<string, string> = {}
  const bufferSize = 20 // Adjust this value as needed

  const escapeRegExp = (string: string) =>
    string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tagNames = Object.keys(tags)
  const openTagRegex = new RegExp(
    `<(${tagNames.map(escapeRegExp).join('|')})\\s*([^>]*)>`,
    'g'
  )
  const closeTagRegex = new RegExp(
    `</(${tagNames.map(escapeRegExp).join('|')})>`,
    'g'
  )

  for await (const chunk of stream) {
    buffer += chunk

    while (buffer.length > bufferSize) {
      if (insideTag === null) {
        const match = openTagRegex.exec(buffer)
        if (match && match.index < bufferSize) {
          const [fullMatch, openTag, attributesString] = match

          const afterMatchIndex = match.index + fullMatch.length
          yield buffer.slice(0, match.index)
          buffer = buffer.slice(afterMatchIndex)

          insideTag = openTag
          currentAttributes = parseAttributes(
            attributesString,
            tags[openTag].attributeNames
          )
          tags[openTag].onTagStart(currentAttributes)
        } else {
          yield buffer.slice(0, buffer.length - bufferSize)
          buffer = buffer.slice(buffer.length - bufferSize)
        }
      } else {
        const closeMatch = closeTagRegex.exec(buffer)
        if (closeMatch) {
          const [fullMatch, closeTag] = closeMatch
          const closeIndex = closeMatch.index
          const content = buffer.slice(0, closeIndex)
          const complete = tags[insideTag].onTagEnd(content, currentAttributes)

          buffer = buffer.slice(closeIndex + fullMatch.length)
          insideTag = null
          currentAttributes = {}
          if (complete) {
            return
          }
        } else if (buffer.length > bufferSize * 2) {
          // If we're inside a tag but haven't found the end, yield some content
          yield buffer.slice(0, buffer.length - bufferSize)
          buffer = buffer.slice(buffer.length - bufferSize)
        } else {
          break
        }
      }
    }
  }

  // Yield any remaining content in the buffer
  if (buffer) {
    yield buffer
  }
}

// ... rest of the file remains unchanged
