function cursorUp(params: {
  lineStarts: number[]
  cursorPosition: number
}): number {
  const { lineStarts, cursorPosition } = params
  const lineIndex = lineStarts.findLastIndex((start) => start <= cursorPosition)

  if (lineIndex === -1 || lineIndex === 0) {
    return 0
  }

  const index = cursorPosition - lineStarts[lineIndex]
  return Math.min(lineStarts[lineIndex] - 1, lineStarts[lineIndex - 1] + index)
}

function cursorDown(params: {
  lineStarts: number[]
  cursorPosition: number
  cursorIsChar: boolean
}): number {
  const { lineStarts, cursorPosition, cursorIsChar } = params
  const lineIndex = lineStarts.findLastIndex((start) => start <= cursorPosition)

  if (lineIndex === -1 || lineIndex === lineStarts.length - 1) {
    return Infinity
  }

  // Need to account for cursor character itself
  const index = cursorPosition - lineStarts[lineIndex] + (cursorIsChar ? -1 : 0)

  return Math.min(
    (lineStarts[lineIndex + 2] ?? Infinity) - 1,
    lineStarts[lineIndex + 1] + index,
  )
}

export function calculateNewCursorPosition(params: {
  cursorPosition: number
  lineStarts: number[]
  cursorIsChar: boolean
  direction: 'up' | 'down'
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
