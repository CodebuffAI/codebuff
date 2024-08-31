import { CSSProperties, ReactNode } from 'react'
import { useMeasureSize } from 'web/hooks/use-measure-size'

/** Automatically calculate size and pass it to children */
export const SizedContainer = (props: {
  children: (width: number, height: number) => ReactNode
  /**
   * You must set width and height to a value (like h-8)
   * or to a % of the parent (like w-full) for resizing.
   * Unless the parent be flexin'
   *
   * (Normally the browser sets an element's width and height by its content)
   *
   * So, className is not optional. Set to "" only if you know what you're doing.
   */
  className: string
  style?: CSSProperties
}) => {
  const { children, className, style } = props

  const { elemRef, width, height } = useMeasureSize()

  // put containerRef on the inner div so that size excludes padding
  return (
    <div className={className} style={style}>
      <div ref={elemRef} className="h-full w-full">
        {width && height ? children(width, height) : null}
      </div>
    </div>
  )
}
