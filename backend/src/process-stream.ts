const fileOpenRegex = /<file path="([^"]+)">/g
const fileCloseRegex = /<\/file>/g

export async function* processStreamWithFiles<T extends string | object>(
  stream: AsyncGenerator<T>,
  onFileStart: (filePath: string) => void,
  onFile: (filePath: string, fileContent: string) => void
) {
  let buffer = ''
  let insideTag = 'none'
  let currentFilePath = ''

  for await (const chunk of stream) {
    if (typeof chunk === 'object') {
      yield chunk
      continue
    }

    buffer += chunk

    while (true) {
      if (insideTag === 'none') {
        const openMatch = fileOpenRegex.exec(buffer)
        if (openMatch) {
          const afterOpenIndex = openMatch.index + openMatch[0].length
          const chunkStartIndex = buffer.length - chunk.length
          yield buffer.slice(chunkStartIndex, afterOpenIndex)
          buffer = buffer.slice(afterOpenIndex)
          currentFilePath = openMatch[1]
          onFileStart(currentFilePath)
          insideTag = 'file'
        } else {
          yield chunk
          break
        }
      } else if (insideTag === 'file') {
        const closeMatch = fileCloseRegex.exec(buffer)
        if (closeMatch) {
          const closeIndex = closeMatch.index

          const fileContent = buffer.slice(0, closeIndex)
          onFile(currentFilePath, fileContent)
          currentFilePath = ''

          const afterCloseIndex = closeIndex + closeMatch[0].length
          yield buffer.slice(closeIndex)
          buffer = buffer.slice(afterCloseIndex)
          insideTag = 'none'
          break
        } else {
          break
        }
      }
    }
  }
}
