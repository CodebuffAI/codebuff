import { TextAttributes } from '@opentui/core'
import { useEffect, useMemo, useState } from 'react'
import React from 'react'

export const DEFAULT_SHIMMER_COLORS = [
  '#ff8c00',
  '#ff9100',
  '#ff9500',
  '#ff9a00',
  '#ffa500',
  '#ffa000',
  '#ff9500',
  '#ff8c00',
  '#ff8300',
  '#ff7700',
]

export const ShimmerText = ({
  text,
  interval = 250,
  colors = DEFAULT_SHIMMER_COLORS,
}: {
  text: string
  interval?: number
  colors?: string[]
}) => {
  const [pulse, setPulse] = useState<number>(0)
  const chars = text.split('')
  const numChars = chars.length

  useEffect(() => {
    const pulseInterval = setInterval(() => {
      setPulse((prev) => (prev + 1) % numChars)
    }, interval)

    return () => clearInterval(pulseInterval)
  }, [interval, numChars])

  const generateColors = (length: number, colorPalette: string[]): string[] => {
    const generatedColors: string[] = []
    for (let i = 0; i < length; i++) {
      const ratio = i / (length - 1)
      const colorIndex = Math.floor(ratio * (colorPalette.length - 1))
      generatedColors.push(colorPalette[colorIndex])
    }
    return generatedColors
  }

  const generateAttributes = (length: number): number[] => {
    const attributes: number[] = []
    for (let i = 0; i < length; i++) {
      const ratio = i / (length - 1)
      if (ratio < 0.23) {
        attributes.push(TextAttributes.BOLD)
      } else if (ratio < 0.69) {
        attributes.push(TextAttributes.NONE)
      } else {
        attributes.push(TextAttributes.DIM)
      }
    }
    return attributes
  }

  const generatedColors = useMemo(
    () => generateColors(numChars, colors),
    [numChars, colors],
  )
  const attributes = useMemo(() => generateAttributes(numChars), [numChars])

  const parts: { text: string; color: string; attr: number }[] = []
  let currentColor = generatedColors[0]
  let currentAttr = attributes[0]
  let currentText = ''

  chars.forEach((char, index) => {
    const phase = (pulse - index + numChars) % numChars
    const charColor = generatedColors[phase]
    const charAttr = attributes[phase]

    if (charColor === currentColor && charAttr === currentAttr) {
      currentText += char
    } else {
      if (currentText) {
        parts.push({ text: currentText, color: currentColor, attr: currentAttr })
      }
      currentText = char
      currentColor = charColor
      currentAttr = charAttr
    }
  })

  if (currentText) {
    parts.push({ text: currentText, color: currentColor, attr: currentAttr })
  }

  return (
    <>
      {parts.map((part, index) => (
        <span key={index} fg={part.color} attributes={part.attr}>
          {part.text}
        </span>
      ))}
    </>
  )
}
