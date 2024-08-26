import clsx from 'clsx'
import { ReactNode } from 'react'

export function Title(props: { className?: string; children?: ReactNode }) {
  const { className, children } = props
  return (
    <h1
      className={clsx(
        'text-primary-700 mb-4 inline-block text-2xl font-normal sm:mb-6 sm:text-3xl',
        className
      )}
    >
      {children}
    </h1>
  )
}
