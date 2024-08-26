import clsx from 'clsx'

export function ProfitBadge(props: {
  profitPercent: number
  round?: boolean
  className?: string
  grayColor?: boolean
}) {
  const { profitPercent, grayColor, round, className } = props
  if (!profitPercent) return null
  const colors = grayColor
    ? 'bg-ink-100 text-ink-500'
    : profitPercent > 0
    ? 'bg-teal-100 text-teal-700'
    : 'bg-scarlet-100 text-scarlet-700'
  const rounded = round ? Math.round(profitPercent) : profitPercent.toFixed(1)
  if (rounded == 0) return null
  return (
    <span
      className={clsx(
        'ml-1 inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium',
        colors,
        className
      )}
    >
      {(profitPercent > 0 ? '+' : '') + rounded + '%'}
    </span>
  )
}
