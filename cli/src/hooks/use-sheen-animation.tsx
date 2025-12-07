import React, { useCallback, useEffect, useState } from 'react'

import {
  SHADOW_CHARS,
  SHEEN_STEP,
  SHEEN_INTERVAL_MS,
} from '../login/constants'
import { getSheenColor } from '../login/utils'

interface UseSheenAnimationParams {
  logoColor: string
  accentColor: string
  blockColor: string
  terminalWidth: number | undefined
  sheenPosition: number
  setSheenPosition: (value: number | ((prev: number) => number)) => void
}

/**
 * Custom hook that handles the sheen animation effect on the logo
 * Animates a fill effect that loops: fill with accent color, then unfill back to original
 */
export function useSheenAnimation({
  logoColor,
  accentColor,
  blockColor,
  terminalWidth,
  sheenPosition,
  setSheenPosition,
}: UseSheenAnimationParams) {
  // Track whether we're in the reverse (unfill) phase
  const [isReversing, setIsReversing] = useState(false)

  // Run looping sheen animation
  useEffect(() => {
    const maxPosition = Math.max(10, Math.min((terminalWidth || 80) - 4, 100))
    const step = SHEEN_STEP

    const interval = setInterval(() => {
      setSheenPosition((prev) => {
        const next = prev + step
        
        if (next >= maxPosition) {
          // Reached the end, switch direction
          setIsReversing((wasReversing) => !wasReversing)
          return 0 // Reset position for next phase
        }
        
        return next
      })
    }, SHEEN_INTERVAL_MS)

    return () => {
      clearInterval(interval)
    }
  }, [terminalWidth, setSheenPosition])

  // Apply sheen effect to a character based on its position
  const applySheenToChar = useCallback(
    (char: string, charIndex: number) => {
      if (char === ' ' || char === '\n') {
        return <span key={charIndex}>{char}</span>
      }

      const color = getSheenColor(
        char,
        charIndex,
        sheenPosition,
        logoColor,
        SHADOW_CHARS,
        accentColor,
        blockColor,
        isReversing,
      )

      return (
        <span key={charIndex} fg={color}>
          {char}
        </span>
      )
    },
    [sheenPosition, logoColor, accentColor, blockColor, isReversing],
  )

  return {
    applySheenToChar,
  }
}
