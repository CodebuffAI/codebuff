import clsx from 'clsx'
import { forwardRef } from 'react'

export const Card = forwardRef(function Card(
  props: JSX.IntrinsicElements['div'],
  ref: React.Ref<HTMLDivElement>
) {
  const { children, className, ...rest } = props
  return (
    <div
      className={clsx(
        'bg-canvas-0 border-ink-300 cursor-pointer rounded-lg border transition-shadow hover:shadow-md focus:shadow-md',
        className
      )}
      ref={ref}
      {...rest}
    >
      {children}
    </div>
  )
})
