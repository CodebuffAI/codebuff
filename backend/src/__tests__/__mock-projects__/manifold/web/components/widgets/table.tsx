import clsx from 'clsx'

/** `<table>` with styles. Expects table html (`<thead>`, `<td>` etc) */
export const Table = (props: {
  className?: string
  children: React.ReactNode
}) => {
  const { className, children } = props

  return (
    <table
      className={clsx(
        'text-ink-700 w-full whitespace-nowrap text-left text-sm [&>thead]:font-bold [&_td]:p-2 [&_th]:p-2',
        className
      )}
    >
      {children}
    </table>
  )
}
