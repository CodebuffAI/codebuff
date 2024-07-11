export const createFileBlock = (filePath: string, content: string) => {
  return '<' + `file path="${filePath}">
${content}
</file` + '>'
}
export const createFileBlockWithoutPath = (content: string) => {
  return '<' + `file>
${content}
</file` + '>'
}

export const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g
export const fileWithNoPathRegex = /<file>([\s\S]*?)<\/file>/g

export const parseFileBlocks = (fileBlocks: string) => {
  let fileMatch
  const files: Record<string, string> = {}
  while ((fileMatch = fileRegex.exec(fileBlocks)) !== null) {
    const [, filePath, fileContent] = fileMatch
    files[filePath] = fileContent
  }
  return files
}

export const parseFileBlocksWithoutPath = (fileBlocks: string) => {
  let fileMatch
  const files: string[] = []
  while ((fileMatch = fileWithNoPathRegex.exec(fileBlocks)) !== null) {
    const [, fileContent] = fileMatch
    files.push(fileContent)
  }
  return files
}