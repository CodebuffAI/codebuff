import clsx from 'clsx'

/** container with a gradient border  */
export function GradientContainer(props: {
  children: React.ReactNode
  className?: string
}) {
  const { children, className } = props
  return (
    <div
      className={clsx(
        'to-primary-400 relative rounded-lg bg-gradient-to-r from-pink-300 via-purple-300 p-1 py-1 shadow-lg shadow-fuchsia-300/50',
        className
      )}
    >
      <div className="bg-canvas-0 w-full rounded p-3 ">{children}</div>
    </div>
  )
}
