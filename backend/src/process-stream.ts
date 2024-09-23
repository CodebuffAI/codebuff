const fileOpenRegex = /<file path="([^"]+)">/g
const fileCloseRegex = /<\/file>/g

export async function* processStreamWithTags<T extends string | object>(
  stream: AsyncGenerator<T>,
  tags: {
    [tagName: string]: {
      attributeNames: string[]
      onTagStart: (attributes: Record<string, string>) => void
      onTagEnd: (content: string, attributes: Record<string, string>) => void
    }
  }
) {
  let buffer = ''
  let insideTag: string | null = null
  let currentAttributes: Record<string, string> = {}

  const escapeRegExp = (string: string) =>
    string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tagNames = Object.keys(tags)
  const tagRegex = new RegExp(
    `<(${tagNames.map(escapeRegExp).join('|')})\\s*([^>]*)>|</(${tagNames.map(escapeRegExp).join('|')})>`,
    'g'
  )

  for await (const chunk of stream) {
    if (typeof chunk === 'object') {
      yield chunk
      continue
    }

    buffer += chunk

    while (true) {
      if (insideTag === null) {
        const match = tagRegex.exec(buffer)
        if (match) {
          const [fullMatch, openTag, attributesString, closeTag] = match
          const matchIndex = match.index
          const afterMatchIndex = matchIndex + fullMatch.length

          yield buffer.slice(0, afterMatchIndex)
          buffer = buffer.slice(afterMatchIndex)

          if (openTag) {
            insideTag = openTag
            currentAttributes = parseAttributes(
              attributesString,
              tags[openTag].attributeNames
            )
            tags[openTag].onTagStart(currentAttributes)
          } else if (closeTag) {
            // Ignore closing tags when not inside a tag
          }
        } else {
          if (buffer.length > 0) {
            yield buffer
          }
          buffer = ''
          break
        }
      } else {
        const closeMatch = new RegExp(`</${insideTag}>`).exec(buffer)
        if (closeMatch) {
          const closeIndex = closeMatch.index
          const content = buffer.slice(0, closeIndex)
          tags[insideTag].onTagEnd(content, currentAttributes)

          const afterCloseIndex = closeIndex + closeMatch[0].length
          yield buffer.slice(closeIndex, afterCloseIndex)
          buffer = buffer.slice(afterCloseIndex)
          insideTag = null
          currentAttributes = {}
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
