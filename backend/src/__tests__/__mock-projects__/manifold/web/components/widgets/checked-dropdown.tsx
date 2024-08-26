import { Popover } from '@headlessui/react'
import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { usePopper } from 'react-popper'
import { AnimationOrNothing } from '../comments/dropdown-menu'

export type CheckedDropdownItem = {
  name: string
  content: ReactNode
  onToggle: () => void | Promise<void>
  checked: boolean
}

// NOTE: you can't conditionally render any of the items from a useEffect hook, or you'll get hydration errors
export default function CheckedDropdownMenu(props: {
  items: CheckedDropdownItem[]
  menuWidth?: string
  buttonClass?: string
  className?: string
  menuItemsClass?: string
  buttonDisabled?: boolean
  withinOverflowContainer?: boolean
  buttonContent: (open: boolean) => ReactNode
  checkboxClassName?: string
}) {
  const {
    items,
    menuItemsClass,
    menuWidth,
    buttonClass,
    className,
    buttonDisabled,
    withinOverflowContainer,
    buttonContent,
    checkboxClassName,
  } = props
  const [referenceElement, setReferenceElement] =
    useState<HTMLButtonElement | null>()
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>()
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    strategy: withinOverflowContainer ? 'fixed' : 'absolute',
  })
  return (
    <Popover className={clsx('relative inline-block text-left', className)}>
      {({ open }) => (
        <>
          <Popover.Button
            ref={setReferenceElement}
            className={clsx(
              'text-ink-500 hover:text-ink-800 flex items-center',
              buttonClass
            )}
            onClick={(e: any) => {
              e.stopPropagation()
            }}
            disabled={buttonDisabled}
          >
            <span className="sr-only">Open options</span>
            {buttonContent(open)}
          </Popover.Button>

          <AnimationOrNothing show={open} animate={!withinOverflowContainer}>
            <Popover.Panel
              ref={setPopperElement}
              style={styles.popper}
              {...attributes.popper}
              className={clsx(
                'bg-canvas-0 ring-ink-1000  z-30 mt-2 rounded-md px-4 py-2 shadow-lg ring-1 ring-opacity-5 focus:outline-none',
                menuWidth ?? 'w-34',
                menuItemsClass,
                'py-1'
              )}
            >
              {items.map((item) => (
                <div key={item.name}>
                  <div className={clsx(className, 'space-y-5')}>
                    <div className="relative flex items-center gap-2">
                      <div className="flex h-6 items-center">
                        <input
                          type="checkbox"
                          className={clsx(
                            'border-ink-300 bg-canvas-0 dark:border-ink-500 text-primary-600 focus:ring-primary-500 h-4 w-4 rounded',
                            checkboxClassName
                          )}
                          checked={item.checked}
                          onChange={() => item.onToggle()}
                        />
                      </div>
                      {item.content}
                    </div>
                  </div>
                </div>
              ))}
            </Popover.Panel>
          </AnimationOrNothing>
        </>
      )}
    </Popover>
  )
}
