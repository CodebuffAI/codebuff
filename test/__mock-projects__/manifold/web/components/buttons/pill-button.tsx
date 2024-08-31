import clsx from 'clsx'
import { ReactNode } from 'react'

export function PillButton(props: {
  selected: boolean
  onSelect: () => void
  xs?: boolean
  className?: string
  children: ReactNode
}) {
  const { children, selected, onSelect, xs, className } = props

  return (
    <button
      className={clsx(
        'cursor-pointer select-none whitespace-nowrap rounded-full px-3 py-1.5 outline-none',
        xs ? 'text-xs' : 'text-sm',
        selected
          ? 'bg-blue-500 text-white hover:bg-blue-600 focus-visible:bg-blue-600'
          : 'bg-ink-200 hover:bg-ink-300 focus-visible:bg-ink-300',
        className
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}
