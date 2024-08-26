import clsx from 'clsx'

export function TextButton(props: {
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  const { onClick, children, className } = props

  return (
    <span
      className={clsx(
        className,
        'hover:decoration-primary-400 focus:decoration-primary-400 cursor-pointer gap-2 hover:underline hover:decoration-2 focus:underline focus:decoration-2'
      )}
      tabIndex={0}
      onClick={onClick}
    >
      {children}
    </span>
  )
}
