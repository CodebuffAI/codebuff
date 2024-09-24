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
    let currentChunk: string = chunk

    buffer += chunk

    while (true) {
      if (insideTag === null) {
        const match = openTagRegex.exec(buffer)
        if (match) {
          const [fullMatch, openTag, attributesString] = match

          const afterMatchIndex = match.index + fullMatch.length
          const chunkStartIndex = buffer.length - currentChunk.length
          yield buffer.slice(chunkStartIndex, afterMatchIndex)

          buffer = buffer.slice(afterMatchIndex)

          insideTag = openTag
          currentAttributes = parseAttributes(
            attributesString,
            tags[openTag].attributeNames
          )
          tags[openTag].onTagStart(currentAttributes)
        } else {
          if (currentChunk !== '') {
            yield currentChunk
          }
          break
        }
      } else {
        const closeMatch = closeTagRegex.exec(buffer)
        if (closeMatch) {
          const [fullMatch, closeTag] = closeMatch
          const closeIndex = closeMatch.index
          const content = buffer.slice(0, closeIndex)
          const complete = tags[insideTag].onTagEnd(content, currentAttributes)

          const afterCloseIndex = closeIndex + fullMatch.length
          yield buffer.slice(closeIndex, afterCloseIndex)
          buffer = buffer.slice(afterCloseIndex)
          currentChunk = buffer
          insideTag = null
          currentAttributes = {}
          if (complete) {
            return
          }
        } else {
          break
        }
      }
    }
  }
}

function parseAttributes(
  attributesString: string,
  attributeNames: string[]
): Record<string, string> {
  const attributes: Record<string, string> = {}
  const regex = new RegExp(`(${attributeNames.join('|')})="([^"]*)"`, 'g')
  let match
  while ((match = regex.exec(attributesString)) !== null) {
    attributes[match[1]] = match[2]
  }
  return attributes
}
