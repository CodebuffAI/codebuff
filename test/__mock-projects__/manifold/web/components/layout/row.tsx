import clsx from 'clsx'
import { forwardRef } from 'react'

export const Row = forwardRef(function Row(
  props: JSX.IntrinsicElements['div'],
  ref: React.Ref<HTMLDivElement>
) {
  const { children, className, ...rest } = props
  return (
    <div className={clsx(className, 'flex flex-row')} ref={ref} {...rest}>
      {children}
    </div>
  )
})
