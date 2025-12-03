import { TextAttributes } from '@opentui/core'
import React, { useEffect, useRef, useState } from 'react'

interface InputCursorProps {
  visible: boolean
  focused: boolean
  shouldBlink?: boolean
  char?: string
  color?: string
  blinkDelay?: number
  blinkInterval?: number
  bold?: boolean
}

export const InputCursor: React.FC<InputCursorProps> = ({
  visible,
  focused,
  shouldBlink = true,
  char = '▍',
  color,
  blinkDelay = 500,
  blinkInterval = 500,  // Faster blinking
  bold = true,
}) => {
  // false = normal/visible, true = invisible
  const [isInvisible, setIsInvisible] = useState(false)
  const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Handle blinking (toggle visible/invisible) when idle
  useEffect(() => {
    // Clear any existing interval
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current)
      blinkIntervalRef.current = null
    }

    // Reset cursor to visible
    setIsInvisible(false)

    // Only blink if shouldBlink is enabled, focused, and visible
    if (!shouldBlink || !focused || !visible) return

    // Set up idle detection
    const idleTimer = setTimeout(() => {
      // Start blinking interval (toggle between visible and invisible)
      blinkIntervalRef.current = setInterval(() => {
        setIsInvisible((prev) => !prev)
      }, blinkInterval)
    }, blinkDelay)

    return () => {
      clearTimeout(idleTimer)
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current)
        blinkIntervalRef.current = null
      }
    }
  }, [visible, focused, shouldBlink, blinkDelay, blinkInterval])

  if (!visible || !focused) {
    return null
  }

  // When invisible, return a space to maintain layout
  if (isInvisible) {
    return <span> </span>
  }

  return (
    <span
      {...(color ? { fg: color } : undefined)}
      {...(bold ? { attributes: TextAttributes.BOLD } : undefined)}
    >
      {char}
    </span>
  )
}