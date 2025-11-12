import React, { cloneElement, isValidElement, memo, type ReactElement, type ReactNode } from 'react'

interface ButtonProps {
  onClick?: (e?: unknown) => void | Promise<unknown>
  onMouseOver?: () => void
  onMouseOut?: () => void
  style?: Record<string, unknown>
  children?: ReactNode
  // pass-through for box host props
  [key: string]: unknown
}

function makeTextUnselectable(node: ReactNode): ReactNode {
  if (node === null || node === undefined || typeof node === 'boolean') return node
  if (typeof node === 'string' || typeof node === 'number') return node

  if (Array.isArray(node)) {
    return node.map((child, idx) => <React.Fragment key={idx}>{makeTextUnselectable(child)}</React.Fragment>)
  }

  if (!isValidElement(node)) return node

  const el = node as ReactElement
  const type = el.type

  // Ensure text nodes are not selectable
  if (typeof type === 'string' && type === 'text') {
    const nextProps = { ...el.props, selectable: false }
    const nextChildren = el.props?.children ? makeTextUnselectable(el.props.children) : el.props?.children
    return cloneElement(el, nextProps, nextChildren)
  }

  // Recurse into other host elements and components' children
  const nextChildren = el.props?.children ? makeTextUnselectable(el.props.children) : el.props?.children
  return cloneElement(el, el.props, nextChildren)
}

export const Button = memo(({ onClick, onMouseOver, onMouseOut, style, children, ...rest }: ButtonProps) => {
  const processedChildren = makeTextUnselectable(children)
  return (
    <box
      {...rest}
      style={style}
      onMouseDown={onClick}
      onMouseOver={onMouseOver}
      onMouseOut={onMouseOut}
    >
      {processedChildren}
    </box>
  )
})
