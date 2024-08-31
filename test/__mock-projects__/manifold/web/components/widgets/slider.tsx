import clsx from 'clsx'
import * as RxSlider from '@radix-ui/react-slider'
import { ReactNode } from 'react'

const colors = {
  green: ['bg-teal-400', 'focus:outline-teal-600/30 bg-teal-600'],
  'light-green': [
    'bg-emerald-200/50 dark:bg-emerald-800/50',
    'focus:outline-emerald-200/20 bg-emerald-200 dark:bg-teal-200',
  ],
  red: ['bg-scarlet-400', 'focus:outline-scarlet-600/30 bg-scarlet-600'],
  indigo: ['bg-primary-300', 'focus:outline-primary-500/30 bg-primary-500'],
  // light: ['primary-200', 'primary-300']
} as const
export type Mark = { value: number; label: string }

export function Slider(props: {
  amount: number
  onChange: (newAmount: number) => void
  min?: number
  max?: number
  step?: number
  marks?: Mark[]
  color?: keyof typeof colors
  className?: string
  disabled?: boolean
  inverted?: boolean
}) {
  const {
    amount,
    onChange,
    min = 0,
    max = 100,
    step,
    marks,
    className,
    disabled,
    color = 'indigo',
    inverted,
  } = props

  const [trackClasses, thumbClasses] = colors[color]

  return (
    <RxSlider.Root
      className={clsx(
        className,
        'relative flex touch-none select-none items-center',
        marks ? 'h-[42px]' : 'h-5'
      )}
      value={[amount]}
      onValueChange={([val]) => onChange(val)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      inverted={inverted}
    >
      <Track className={trackClasses}>
        <div className="absolute left-2.5 right-2.5 h-full">
          {marks?.map(({ value, label }) => (
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(value / (max - min)) * 100}%` }}
              key={value}
            >
              <div
                className={clsx(
                  amount >= value ? trackClasses : 'bg-ink-400',
                  'h-2 w-2 rounded-full'
                )}
              />
              <span className="text-ink-400 absolute left-1/2 top-4 -translate-x-1/2 text-xs">
                {label}
              </span>
            </div>
          ))}
        </div>
      </Track>
      <Thumb className={thumbClasses} />
    </RxSlider.Root>
  )
}

export function RangeSlider(props: {
  lowValue: number
  highValue: number
  setValues: (low: number, high: number) => void
  min?: number
  max?: number
  disabled?: boolean
  step?: number
  color?: keyof typeof colors
  handleSize?: number
  className?: string
  marks?: Mark[]
}) {
  const {
    lowValue,
    highValue,
    setValues,
    min,
    max,
    step,
    disabled,
    color = 'indigo',
    className,
    marks,
  } = props

  const [trackClasses, thumbClasses] = colors[color]

  return (
    <RxSlider.Root
      className={clsx(
        'relative flex h-7 touch-none select-none items-center',
        className
      )}
      value={[lowValue, highValue]}
      step={step ?? 1}
      onValueChange={([low, high]) => setValues(low, high)}
      min={min}
      max={max}
      disabled={disabled}
    >
      <Track className={trackClasses}>
        <div>
          {marks?.map(({ value, label }) => (
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${value}%` }}
              key={value}
            >
              <span className="text-ink-400 absolute left-1/2 top-4 -translate-x-1/2 text-xs">
                {label}
              </span>
            </div>
          ))}
        </div>
      </Track>
      <Thumb className={thumbClasses} />
      <Thumb className={thumbClasses} />
    </RxSlider.Root>
  )
}

const Track = (props: { className: string; children?: ReactNode }) => {
  const { className, children } = props
  return (
    <RxSlider.Track className="bg-ink-300 relative h-1 grow rounded-full">
      {children}
      <RxSlider.Range
        className={clsx(className, 'absolute h-full rounded-full')}
      />
    </RxSlider.Track>
  )
}

const Thumb = (props: { className: string }) => (
  <RxSlider.Thumb
    className={clsx(
      props.className,
      'block h-5 w-5 cursor-col-resize rounded-full outline outline-4 outline-transparent transition-colors'
    )}
  />
)
