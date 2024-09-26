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
  const bufferSize = 250

  const escapeRegExp = (string: string) =>
    string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tagNames = Object.keys(tags)
  const openTagRegex = new RegExp(
    `<(${tagNames.map(escapeRegExp).join('|')})\\s*([^>]*)>`
  )
  const closeTagRegex = new RegExp(
    `</(${tagNames.map(escapeRegExp).join('|')})>`
  )

  function parseBuffer(bufferSize: number) {
    let toYield = ''

    while (buffer.length > bufferSize) {
      if (insideTag === null) {
        const match = buffer.match(openTagRegex)
        if (match && match.index !== undefined) {
          const [fullMatch, openTag, attributesString] = match

          const afterMatchIndex = match.index + fullMatch.length
          toYield += buffer.slice(0, match.index)
          buffer = buffer.slice(afterMatchIndex)

          insideTag = openTag
          currentAttributes = parseAttributes(
            attributesString,
            tags[openTag].attributeNames
          )
          const startTagYield = tags[openTag].onTagStart(currentAttributes)
          if (startTagYield) {
            toYield += startTagYield
          }
        } else {
          toYield += buffer.slice(0, buffer.length - bufferSize)
          buffer = buffer.slice(buffer.length - bufferSize)
        }
      } else {
        const closeMatch = buffer.match(closeTagRegex)
        if (closeMatch && closeMatch.index !== undefined) {
          const [fullMatch, closeTag] = closeMatch
          const closeIndex = closeMatch.index
          const content = buffer.slice(0, closeIndex)
          const complete = tags[insideTag].onTagEnd(content, currentAttributes)

          buffer = buffer.slice(closeIndex + fullMatch.length)
          insideTag = null
          currentAttributes = {}
          if (complete) {
            return { toYield, isComplete: true }
          }
        } else {
          break
        }
      }
    }
    return { toYield, isComplete: false }
  }

  for await (const chunk of stream) {
    buffer += chunk

    const { toYield, isComplete } = parseBuffer(bufferSize)
    if (toYield) {
      yield toYield
    }
    if (isComplete) {
      return
    }
  }

  const { toYield } = parseBuffer(0)
  if (toYield) {
    yield toYield
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
