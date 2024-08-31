import clsx from 'clsx'
import Textarea from 'react-expanding-textarea'

/** Expanding `<textarea>` with same style as input.tsx */
export const ExpandingInput = (props: Parameters<typeof Textarea>[0]) => {
  const { className, ...rest } = props
  return (
    <Textarea
      className={clsx(
        'disabled:bg-canvas-50 border-ink-300 disabled:border-ink-200 disabled:text-ink-500 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 resize-none rounded-md border px-4  leading-loose shadow-sm transition-colors focus:outline-none focus:ring-1 disabled:cursor-not-allowed ',
        className
      )}
      {...rest}
    />
  )
}
