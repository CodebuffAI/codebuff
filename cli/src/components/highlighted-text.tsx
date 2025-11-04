import React from 'react'

interface HighlightedSubsequenceTextProps {
  text: string
  indices?: number[] | null
  color: string
  highlightColor: string
}

export const HighlightedSubsequenceText = ({
  text,
  indices,
  color,
  highlightColor,
}: HighlightedSubsequenceTextProps) => {
  if (!indices || indices.length === 0) {
    return <span fg={color}>{text}</span>
  }

  const parts: React.ReactNode[] = []
  const highlightSet = new Set(indices)
  let currentSegment = ''
  let isHighlighted = false

  for (let i = 0; i < text.length; i++) {
    const shouldHighlight = highlightSet.has(i)

    if (shouldHighlight !== isHighlighted) {
      if (currentSegment) {
        parts.push(
          <span key={parts.length} fg={isHighlighted ? highlightColor : color}>
            {currentSegment}
          </span>,
        )
      }
      currentSegment = text[i]
      isHighlighted = shouldHighlight
    } else {
      currentSegment += text[i]
    }
  }

  if (currentSegment) {
    parts.push(
      <span key={parts.length} fg={isHighlighted ? highlightColor : color}>
        {currentSegment}
      </span>,
    )
  }

  return <>{parts}</>
}
