const truncatedLengths = {
  sm: 10,
  md: 20,
  lg: 50,
  xl: 75,
}

const TRUNCATE_BUFFER = 3

export function truncateText(
  text: string | undefined,
  truncateLength: 'sm' | 'md' | 'lg' | 'xl' | 'none'
) {
  if (truncateLength === 'none' || !text) {
    return text
  }
  const slice = truncatedLengths[truncateLength]
  if (text.length <= slice + TRUNCATE_BUFFER) {
    return text
  }
  return text.slice(0, slice) + '...'
}
