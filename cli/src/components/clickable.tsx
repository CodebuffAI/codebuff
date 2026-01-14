import React, { cloneElement, isValidElement, memo } from 'react'
import type { ReactElement, ReactNode } from 'react'

/**
 * Makes all `<text>` and `<span>` children non-selectable.
 * Use for interactive elements where text selection during clicks is undesirable.
 */
export function makeTextUnselectable(node: ReactNode): ReactNode {
  if (node === null || node === undefined || typeof node === 'boolean') return node
  if (typeof node === 'string' || typeof node === 'number') return node

  if (Array.isArray(node)) {
    return node.map((child, idx) => <React.Fragment key={idx}>{makeTextUnselectable(child)}</React.Fragment>)
  }

  if (!isValidElement(node)) return node

  const el = node as ReactElement
  const type = el.type

  // Ensure text and span nodes are not selectable
  if (typeof type === 'string' && (type === 'text' || type === 'span')) {
    const nextProps = { ...el.props, selectable: false }
    const nextChildren = el.props?.children ? makeTextUnselectable(el.props.children) : el.props?.children
    return cloneElement(el, nextProps, nextChildren)
  }

  // Recurse into other host elements and components' children
  const nextChildren = el.props?.children ? makeTextUnselectable(el.props.children) : el.props?.children
  return cloneElement(el, el.props, nextChildren)
}

interface ClickableProps {
  /** Element type to render: 'box' (default) or 'text' */
  as?: 'box' | 'text'
  onMouseDown?: (e?: unknown) => void
  onMouseUp?: (e?: unknown) => void
  onMouseOver?: () => void
  onMouseOut?: () => void
  style?: Record<string, unknown>
  children?: ReactNode
  // pass-through for host element props
  [key: string]: unknown
}

/**
 * Wrapper for interactive areas. Makes text non-selectable automatically.
 * Use `as="text"` for inline clickable text, default is `as="box"`.
 */
export const Clickable = memo(function Clickable({
  as = 'box',
  onMouseDown,
  onMouseUp,
  onMouseOver,
  onMouseOut,
  style,
  children,
  ...rest
}: ClickableProps) {
  const sharedProps = {
    ...rest,
    style,
    onMouseDown,
    onMouseUp,
    onMouseOver,
    onMouseOut,
  }

  if (as === 'text') {
    return (
      <text {...sharedProps} selectable={false}>
        {children}
      </text>
    )
  }

  // Default: box with processed children
  const processedChildren = makeTextUnselectable(children)
  return <box {...sharedProps}>{processedChildren}</box>
})
