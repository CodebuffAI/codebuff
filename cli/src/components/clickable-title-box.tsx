import React, { memo, useRef } from 'react'

import type { BoxRenderable, MouseEvent } from '@opentui/core'
import type { ReactNode } from 'react'

interface ClickableTitleBoxProps {
  title?: string
  onTitleClick?: () => void
  style?: Record<string, unknown>
  children?: ReactNode
  [key: string]: unknown
}

/** A normal OpenTUI box whose top-border title behaves like a button. */
export const ClickableTitleBox = memo(function ClickableTitleBox({
  title,
  onTitleClick,
  style,
  children,
  ...rest
}: ClickableTitleBoxProps) {
  const boxRef = useRef<BoxRenderable | null>(null)
  const titlePressedRef = useRef(false)

  const isTitleHit = (event: MouseEvent) => {
    const box = boxRef.current
    return Boolean(
      title &&
      onTitleClick &&
      box &&
      event.button === 0 &&
      event.target === box &&
      event.y === box.screenY,
    )
  }

  const handleMouseDown = (event: MouseEvent) => {
    titlePressedRef.current = isTitleHit(event)
    if (titlePressedRef.current) event.stopPropagation()
  }

  const handleMouseUp = (event: MouseEvent) => {
    const clicked = titlePressedRef.current && isTitleHit(event)
    titlePressedRef.current = false
    if (!clicked) return

    event.stopPropagation()
    onTitleClick?.()
  }

  return (
    <box
      {...rest}
      ref={boxRef}
      title={title}
      style={style}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseOut={() => {
        titlePressedRef.current = false
      }}
    >
      {children}
    </box>
  )
})
