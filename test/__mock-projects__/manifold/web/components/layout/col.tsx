import clsx from 'clsx'
import { forwardRef } from 'react'

export const Col = forwardRef(function Col(
  props: JSX.IntrinsicElements['div'],
  ref: React.Ref<HTMLDivElement>
) {
  const { children, className, ...rest } = props

  return (
    <div className={clsx(className, 'flex flex-col')} ref={ref} {...rest}>
      {children}
    </div>
  )
})
