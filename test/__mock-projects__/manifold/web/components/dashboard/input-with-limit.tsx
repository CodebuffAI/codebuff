import { Input } from '../widgets/input'
import clsx from 'clsx'

export const InputWithLimit = (props: {
  text: string
  setText: (text: string) => void
  limit: number
  className?: string
  placeholder?: string
}) => {
  const { text, setText, limit, className, placeholder } = props

  return (
    <div className="relative">
      <Input
        className={className}
        placeholder={placeholder}
        autoFocus
        maxLength={limit * 2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={text.length > limit}
      />
      <div
        className={clsx(
          'absolute right-2 top-1/2 -translate-y-1/2 text-sm',
          text.length <= limit * 0.5
            ? 'hidden'
            : text.length <= limit * 0.9
            ? 'text-ink-500'
            : text.length <= limit
            ? 'text-warning font-semibold'
            : 'text-error font-semibold'
        )}
      >
        {text.length}/{limit}
      </div>
    </div>
  )
}
