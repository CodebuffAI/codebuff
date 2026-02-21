export const tryToDoStringReplacementWithExtraIndentation = (params: {
  oldFileContent: string
  searchContent: string
  replaceContent: string
}) => {
  const { oldFileContent, searchContent, replaceContent } = params
  for (let i = 1; i <= 12; i++) {
    const searchContentWithIndentation = searchContent
      .split('\n')
      .map((line) => (line ? ' '.repeat(i) + line : line))
      .join('\n')
    if (oldFileContent.includes(searchContentWithIndentation)) {
      return {
        searchContent: searchContentWithIndentation,
        replaceContent: replaceContent
          .split('\n')
          .map((line) => (line ? ' '.repeat(i) + line : line))
          .join('\n'),
      }
    }
  }
  for (let i = 1; i <= 6; i++) {
    const searchContentWithIndentation = searchContent
      .split('\n')
      .map((line) => (line ? '\t'.repeat(i) + line : line))
      .join('\n')
    if (oldFileContent.includes(searchContentWithIndentation)) {
      return {
        searchContent: searchContentWithIndentation,
        replaceContent: replaceContent
          .split('\n')
          .map((line) => (line ? '\t'.repeat(i) + line : line))
          .join('\n'),
      }
    }
  }
  return null
}
