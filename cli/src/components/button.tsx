import { memo, useRef } from 'react'

import { makeTextUnselectable } from './clickable'

import type { ReactNode } from 'react'
import type { KeyEvent } from '@opentui/core'

interface ButtonProps {
  onClick?: (e?: unknown) => void | Promise<unknown>
  onMouseOver?: () => void
  onMouseOut?: () => void
  onKeyDown?: (event: KeyEvent) => void
  focusable?: boolean
  style?: Record<string, unknown>
  children?: ReactNode
  // pass-through for box host props
  [key: string]: unknown
}

export const isButtonActivationKey = (event: Pick<KeyEvent, 'name'>) =>
  event.name === 'return' || event.name === 'enter' || event.name === 'space'

/**
 * A button component with proper click detection and non-selectable text.
 *
 * Key behavior:
 * - All nested `<text>`/`<span>` children are made `selectable={false}` via `makeTextUnselectable`
 * - Uses mouseDown/mouseUp tracking so hover or stray mouse events don't trigger clicks
 *
 * When to use:
 * - Use `Button` for standard button-like interactions (primary choice for clickable controls)
 * - Use {@link Clickable} when you need direct control over mouse events but still want
 *   non-selectable text for an interactive region.
 */
export const Button = memo(function Button({
  onClick,
  onMouseOver,
  onMouseOut,
  onKeyDown,
  focusable = onClick != null,
  style,
  children,
  ...rest
}: ButtonProps) {
  const processedChildren = makeTextUnselectable(children)

  // Track whether mouse down occurred on this element to implement proper click detection
  // This prevents hover from triggering clicks in some terminals
  const mouseDownRef = useRef(false)

  const handleMouseDown = () => {
    mouseDownRef.current = true
  }

  const handleMouseUp = (e?: unknown) => {
    // Only trigger click if mouse down happened on this element
    if (mouseDownRef.current && onClick) {
      onClick(e)
    }
    mouseDownRef.current = false
  }

  const handleMouseOut = () => {
    // Reset mouse down state when leaving the element
    mouseDownRef.current = false
    onMouseOut?.()
  }

  const handleKeyDown = (event: KeyEvent) => {
    onKeyDown?.(event)
    if (!event.defaultPrevented && onClick && isButtonActivationKey(event)) {
      event.preventDefault()
      void onClick(event)
    }
  }

  return (
    <box
      {...rest}
      focusable={focusable}
      style={style}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseOver={onMouseOver}
      onMouseOut={handleMouseOut}
    >
      {processedChildren}
    </box>
  )
})
