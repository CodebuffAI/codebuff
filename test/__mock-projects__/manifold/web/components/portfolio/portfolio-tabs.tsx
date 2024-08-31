import clsx from 'clsx'
import { ReactNode } from 'react'

export function PortfolioTab(props: {
  onClick: () => void
  isSelected?: boolean
  children?: ReactNode
  title: string
  className?: string
}) {
  const { onClick, isSelected, children, title, className } = props

  return (
    <button
      className={clsx(
        'border-ink-200 dark:border-ink-300 z-10 -mb-0.5 flex w-1/2 flex-row gap-2 rounded-t-lg border-2 border-b-0  border-opacity-0 px-4 py-2 transition-all dark:border-opacity-0 sm:w-36',
        isSelected
          ? ' bg-canvas-0 border-opacity-100 dark:border-opacity-100'
          : ' bg-ink-200 dark:bg-canvas-0/50',
        className
      )}
      onClick={onClick}
    >
      <div
        className={clsx(
          'whitespace-nowrap text-xs transition-transform sm:text-sm',
          isSelected ? 'text-ink-1000 mx-auto' : 'text-ink-600 ml-0'
        )}
      >
        {title}
      </div>
      <div
        className={clsx(
          isSelected ? 'w-0 opacity-0' : 'opacity-100',
          'transition-opacity'
        )}
      >
        {children}
      </div>
    </button>
  )
}
