function cursorUp(params: {
  lineStarts: number[]
  cursorPosition: number
  desiredIndex: number
}): number {
  const { lineStarts, cursorPosition, desiredIndex } = params
  const lineIndex = lineStarts.findLastIndex((start) => start <= cursorPosition)

  if (lineIndex === -1 || lineIndex === 0) {
    return 0
  }

  const prevLineStart = lineStarts[lineIndex - 1]
  const prevLineEndExclusive = lineStarts[lineIndex] - 1

  return Math.min(prevLineEndExclusive, prevLineStart + desiredIndex)
}

function cursorDown(params: {
  lineStarts: number[]
  cursorPosition: number
  desiredIndex: number
}): number {
  const { lineStarts, cursorPosition, desiredIndex } = params
  const lineIndex = lineStarts.findLastIndex((start) => start <= cursorPosition)

  if (lineIndex === -1 || lineIndex === lineStarts.length - 1) {
    return Infinity
  }

  return Math.min(
    (lineStarts[lineIndex + 2] ?? Infinity) - 1,
    lineStarts[lineIndex + 1] + desiredIndex,
  )
}

export function calculateNewCursorPosition(params: {
  cursorPosition: number
  lineStarts: number[]
  cursorIsChar: boolean
  direction: 'up' | 'down'
  desiredIndex: number
}): number {
  const { direction } = params
  if (direction === 'up') {
    return cursorUp(params)
  }
  if (direction === 'down') {
    return cursorDown(params)
  }
  direction satisfies never
  throw new Error(`Invalid direction: ${direction}`)
}
