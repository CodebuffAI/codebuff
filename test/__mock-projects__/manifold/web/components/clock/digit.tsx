import Segment from './segment'
import React, { useEffect, useState } from 'react'

const charToDigit = {
  '0': [1, 1, 1, 1, 1, 1, 0],
  '1': [0, 1, 1, 0, 0, 0, 0],
  '2': [1, 1, 0, 1, 1, 0, 1],
  '3': [1, 1, 1, 1, 0, 0, 1],
  '4': [0, 1, 1, 0, 0, 1, 1],
  '5': [1, 0, 1, 1, 0, 1, 1],
  '6': [1, 0, 1, 1, 1, 1, 1],
  '7': [1, 1, 1, 0, 0, 0, 0],
  '8': [1, 1, 1, 1, 1, 1, 1],
  '9': [1, 1, 1, 1, 0, 1, 1],
  '@': [1, 1, 1, 1, 1, 0, 1],
  a: [1, 1, 1, 0, 1, 1, 1],
  b: [0, 0, 1, 1, 1, 1, 1],
  c: [1, 0, 0, 1, 1, 1, 0],
  d: [0, 1, 1, 1, 1, 0, 1],
  e: [1, 0, 0, 1, 1, 1, 1],
  f: [1, 0, 0, 0, 1, 1, 1],
  '-': [0, 0, 0, 0, 0, 0, 1],
} as { [key: string]: number[] }
const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

type DigitType = {
  char: string
  color: string
  height: number
  skew: boolean
}

export const Digit = ({
  char = '-',
  color = 'red',
  height = 250,
  skew = false,
}: DigitType) => {
  const style = {
    height: `${height}px`,
    width: `${height * 0.6}px`,
    zIndex: '1',
    padding: skew ? '8px 0px' : '0',
    boxSizing: 'border-box',
  } as React.CSSProperties

  const [activeArray, setActiveArray] = useState(
    char ? charToDigit[char] : charToDigit['-']
  )

  useEffect(() => {
    setActiveArray(char ? charToDigit[char] : charToDigit['-'])
  }, [char])

  return (
    <div className="digit" style={style}>
      {activeArray.map((active, index) => {
        const letter = letters[index]
        return (
          <Segment
            key={letter}
            active={active === 1}
            size={height / 12.5}
            color={color}
            id={letter}
            skew={skew}
          />
        )
      })}
    </div>
  )
}
