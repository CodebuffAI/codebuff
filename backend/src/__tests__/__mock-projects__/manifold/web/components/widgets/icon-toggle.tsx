import { Switch } from '@headlessui/react'
import clsx from 'clsx'

export default function IconToggle(props: {
  on: boolean
  setOn: (on: boolean) => void
  onIcon: React.ComponentType<{ className?: string }>
  offIcon: React.ComponentType<{ className?: string }>
  className?: string
}) {
  const { on, setOn, className } = props

  return (
    <Switch
      checked={on}
      onChange={setOn}
      className={clsx(
        on ? 'bg-primary-600' : 'bg-ink-200',
        'relative inline-flex h-[1.45rem] w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
        className
      )}
    >
      <span className="sr-only">Use setting</span>
      <span
        className={clsx(
          on ? 'translate-x-4' : 'translate-x-0',
          'bg-canvas-0 pointer-events-none relative inline-block h-[1.2rem] w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out'
        )}
      >
        <span
          className={clsx(
            on
              ? 'opacity-0 duration-100 ease-out'
              : 'opacity-100 duration-200 ease-in',
            'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity'
          )}
          aria-hidden="true"
        >
          {<props.offIcon className={'text-ink-600 h-4'} />}
        </span>
        <span
          className={clsx(
            on
              ? 'opacity-100 duration-200 ease-in'
              : 'opacity-0 duration-100 ease-out',
            'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity'
          )}
          aria-hidden="true"
        >
          {<props.onIcon className={'text-primary-700 h-[1.7rem]'} />}
        </span>
      </span>
    </Switch>
  )
}
