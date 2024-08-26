import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'

const colorClasses = {
  'indigo-dark':
    'text-ink-500 hover:bg-primary-100 hover:text-ink-700 aria-checked:bg-primary-500 aria-checked:text-white',
  indigo:
    'text-ink-500 hover:bg-ink-50 aria-checked:bg-primary-100 aria-checked:text-primary-900',
  green:
    'text-ink-500 hover:bg-ink-50 aria-checked:bg-teal-500 aria-checked:text-ink-0',
  red: 'text-ink-500 hover:bg-ink-50 aria-checked:bg-scarlet-500 aria-checked:text-ink-0',
}

export type ColorType = keyof typeof colorClasses

export function ChoicesToggleGroup(props: {
  currentChoice: number | string | boolean | undefined
  choicesMap: { [key: string]: string | number | boolean }
  disabled?: boolean
  disabledOptions?: Array<string | number | boolean> //values
  setChoice: (val: number | string | boolean) => void
  color?: ColorType
  className?: string
  toggleClassName?: string
  children?: React.ReactNode
}) {
  const {
    currentChoice,
    setChoice,
    disabled,
    disabledOptions,
    choicesMap,
    color = 'indigo-dark',
    className,
    children,
    toggleClassName,
  } = props
  return (
    <RadioGroup
      className={clsx(
        className,
        'border-ink-300 text-ink-400 bg-canvas-0 inline-flex flex-row gap-2 rounded-md border p-1 text-sm shadow-sm',
        disabled && 'bg-canvas-50 !cursor-not-allowed'
      )}
      value={currentChoice}
      onChange={setChoice}
      disabled={disabled}
    >
      {Object.entries(choicesMap).map(([choiceKey, choice]) => (
        <RadioGroup.Option
          key={choiceKey}
          value={choice}
          disabled={disabledOptions?.includes(choice)}
          className={({ disabled }) =>
            clsx(
              disabled
                ? 'text-ink-300 aria-checked:bg-ink-300 aria-checked:text-ink-0 cursor-not-allowed'
                : 'cursor-pointer ' + colorClasses[color],
              'ring-primary-500 flex items-center rounded-md p-2 outline-none transition-all focus-visible:ring-2 sm:px-3',
              toggleClassName
            )
          }
        >
          <RadioGroup.Label as="span">{choiceKey}</RadioGroup.Label>
        </RadioGroup.Option>
      ))}
      {children}
    </RadioGroup>
  )
}
