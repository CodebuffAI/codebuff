export async function* processStreamWithTags<T extends string>(
  stream: AsyncGenerator<T>,
  tags: {
    [tagName: string]: {
      attributeNames: string[]
      onTagStart: (attributes: Record<string, string>) => string
      onTagEnd: (content: string, attributes: Record<string, string>) => boolean
    }
  }
) {
  let buffer = ''
  let insideTag: string | null = null
  let currentAttributes: Record<string, string> = {}
  let streamCompleted = false

  const escapeRegExp = (string: string) =>
    string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tagNames = Object.keys(tags)
  const openTagRegex = new RegExp(
    `<(${tagNames.map(escapeRegExp).join('|')})\\s*([^>]*)>`
  )
  const closeTagRegex = new RegExp(
    `</(${tagNames.map(escapeRegExp).join('|')})>`
  )

  function* parseBuffer(
    isEOF: boolean = false
  ): Generator<string, void, unknown> {
    let didParse = true

    while (!streamCompleted && didParse) {
      didParse = false

      if (insideTag === null) {
        // Outside a tag: try to find the next opening tag
        const openMatch = buffer.match(openTagRegex)
        if (openMatch && openMatch.index !== undefined) {
          const [fullMatch, openTag, attributesString] = openMatch
          const beforeTag = buffer.slice(0, openMatch.index)
          const afterMatchIndex = openMatch.index + fullMatch.length

          // Yield any text before the tag
          if (beforeTag) {
            yield beforeTag
          }

          // Move buffer forward
          buffer = buffer.slice(afterMatchIndex)

          // We are now inside this tag
          insideTag = openTag
          currentAttributes = parseAttributes(
            attributesString,
            tags[openTag].attributeNames
          )

          // Call onTagStart
          const startTagYield = tags[openTag].onTagStart(currentAttributes)
          if (startTagYield) {
            yield startTagYield
          }

          didParse = true
        } else {
          // No opening tag found. If it's EOF, yield remaining text.
          if (isEOF && buffer.length > 0) {
            yield buffer
            buffer = ''
          }
        }
      } else {
        // Inside a tag: try to find the closing tag
        const closeMatch = buffer.match(closeTagRegex)
        if (closeMatch && closeMatch.index !== undefined) {
          const [fullMatch, closeTag] = closeMatch
          const content = buffer.slice(0, closeMatch.index)

          // Move buffer forward
          buffer = buffer.slice(closeMatch.index + fullMatch.length)

          // Close the tag
          const complete = tags[insideTag].onTagEnd(content, currentAttributes)
          insideTag = null
          currentAttributes = {}

          if (complete) {
            // If onTagEnd signals completion, set streamCompleted and return
            streamCompleted = true
            return
          }

          didParse = true
        } else if (isEOF) {
          // We reached EOF without finding a closing tag
          // Depending on your needs, yield what's there or handle as malformed.
          if (buffer.length > 0) {
            yield buffer
            buffer = ''
          }
        }
      }
    }
  }

  for await (const chunk of stream) {
    if (streamCompleted) break
    buffer += chunk

    yield* parseBuffer()
    if (streamCompleted) break
  }

  if (!streamCompleted) {
    // After the stream ends, try parsing one last time in case there's leftover text
    yield* parseBuffer(true)
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
