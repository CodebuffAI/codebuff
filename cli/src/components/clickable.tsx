import React, { cloneElement, isValidElement, memo } from 'react'
import type { ReactElement, ReactNode } from 'react'

/**
 * Makes all text content within a React node tree non-selectable.
 *
 * This is important for interactive elements (buttons, clickable boxes) because
 * text inside them should not be selectable when the user clicks - it creates
 * a poor UX where text gets highlighted during interactions.
 *
 * Handles both `<text>` and `<span>` OpenTUI elements by adding `selectable={false}`.
 *
 * @example
 * ```tsx
 * // Use this when building custom interactive components
 * const processedChildren = makeTextUnselectable(children)
 * return <box onMouseDown={handleClick}>{processedChildren}</box>
 * ```
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
 * A wrapper component for any interactive/clickable area in the CLI.
 *
 * **Why use this instead of raw `<box>` or `<text>` with mouse handlers?**
 *
 * This component automatically makes all text content non-selectable, which is
 * essential for good UX - users shouldn't accidentally select text when clicking
 * interactive elements.
 *
 * **The `as` prop:**
 * - `as="box"` (default) - Renders a `<box>` element for layout containers
 * - `as="text"` - Renders a `<text>` element for inline clickable text
 *
 * **When to use `Clickable` vs `Button`:**
 * - Use `Button` for actual button-like interactions (has click-on-mouseup logic)
 * - Use `Clickable` for simpler interactive areas where you need direct mouse event control
 *
 * @example
 * ```tsx
 * // Default: renders <box>
 * <Clickable onMouseDown={handleClick}>
 *   <text>Click me</text>
 * </Clickable>
 *
 * // For inline text: renders <text>
 * <Clickable as="text" onMouseDown={handleCopy}>
 *   <span>⎘ copy</span>
 * </Clickable>
 * ```
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
