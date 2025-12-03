import React, { useCallback, useEffect } from 'react'

import {
  SHADOW_CHARS,
  SHEEN_WIDTH,
  SHEEN_STEP,
  SHEEN_INTERVAL_MS,
} from '../login/constants'
import { getSheenColor } from '../login/utils'

interface UseSheenAnimationParams {
  logoColor: string
  terminalWidth: number | undefined
  sheenPosition: number
  setSheenPosition: (value: number | ((prev: number) => number)) => void
}

/**
 * Custom hook that handles the sheen animation effect on the logo
 * Extracts sheen animation logic from login-modal.tsx
 */
export function useSheenAnimation({
  logoColor,
  terminalWidth,
  sheenPosition,
  setSheenPosition,
}: UseSheenAnimationParams) {
  // Run sheen animation once
  useEffect(() => {
    const maxPosition = Math.max(10, Math.min((terminalWidth || 80) - 4, 100))
    const sheenWidth = SHEEN_WIDTH
    const step = SHEEN_STEP // Advance 2 positions per frame for efficiency
    const endPosition = maxPosition + sheenWidth

    const interval = setInterval(() => {
      setSheenPosition((prev) => {
        const next = prev + step
        // Stop animation when we've cleared all characters
        return next >= endPosition ? endPosition : next
      })
    }, SHEEN_INTERVAL_MS)

    // Calculate when animation should complete and clean up
    const animationDuration = Math.ceil(
      (endPosition / step) * SHEEN_INTERVAL_MS,
    )
    const stopTimeout = setTimeout(() => {
      clearInterval(interval)
    }, animationDuration)

    return () => {
      clearInterval(interval)
      clearTimeout(stopTimeout)
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
      )

      return (
        <span key={charIndex} fg={color}>
          {char}
        </span>
      )
    },
    [sheenPosition, logoColor],
  )

  return {
    applySheenToChar,
  }
}
