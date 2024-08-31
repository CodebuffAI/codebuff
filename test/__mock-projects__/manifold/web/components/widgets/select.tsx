import clsx from 'clsx'

export const Select = (props: JSX.IntrinsicElements['select']) => {
  const { className, children, ...rest } = props

  return (
    <select
      className={clsx(
        'bg-canvas-0 text-ink-1000 border-ink-300 focus:border-primary-500 focus:ring-primary-500 h-12 cursor-pointer self-start overflow-hidden rounded-md border pl-4 pr-10 text-sm shadow-sm focus:outline-none',
        className
      )}
      {...rest}
    >
      {children}
    </select>
  )
}
