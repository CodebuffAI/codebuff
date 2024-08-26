import clsx from 'clsx'
export type SpinnerSize = 'sm' | 'md' | 'lg'

function getSizeClass(size: SpinnerSize) {
  switch (size) {
    case 'sm':
      return 'h-4 w-4 border-2'
    case 'md':
      return 'h-6 w-6 border-4'
    case 'lg':
    default:
      return 'h-8 w-8 border-4'
  }
}

export function LoadingIndicator(props: {
  className?: string
  spinnerClassName?: string
  size?: SpinnerSize
}) {
  const { className, spinnerClassName, size = 'lg' } = props
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div
        className={clsx(
          'border-primary-500 inline-block animate-spin rounded-full border-solid border-r-transparent',
          getSizeClass(size),
          spinnerClassName
        )}
        role="status"
      />
    </div>
  )
}
