import { createElement, ReactElement, ReactNode } from 'react'

// new function for type reasons
export function classToTw(element: ReactElement) {
  return replaceTw(element) as ReactElement
}

/** Traverse react element's tree, replacing className prop with tw for satori engine */
function replaceTw(element: ReactNode): ReactNode {
  // base case
  if (!element || typeof element !== 'object') {
    if (typeof element === 'string') return element
    return element
  }

  // fragment
  if (!('type' in element)) {
    return <>{Array.from(element).map(replaceTw)}</>
  }

  // component
  if (typeof element.type === 'function') {
    if (element.type.prototype?.isReactComponent) {
      throw Error(
        'React class component not supported in classname to tw middleware because Sinclair is lazy.'
      )
    }

    // functional component
    const component = element.type as (props: any) => ReactElement

    const newType = (props: any) => replaceTw(component(props)) as ReactElement
    return createElement(newType, element.props)
  }

  // pure element

  // Replace `className` with `tw` for this element
  const { props } = element
  const newProps = { ...props }
  if (props.className) {
    newProps.tw = props.className
    delete newProps.className
  }

  // Recursively replace children, whether we have many, one, or no children
  const { children } = props
  const newChildren = children
    ? Array.isArray(children)
      ? children.map(replaceTw)
      : [replaceTw(children)]
    : []

  return createElement(element.type, newProps, newChildren)
}
