import { Popover } from '@headlessui/react'
import clsx from 'clsx'
import { AnimationOrNothing } from '../comments/dropdown-menu'
import { useState } from 'react'
import { usePopper } from 'react-popper'

export function CustomizeableDropdown(props: {
  menuWidth?: string
  buttonContent: (open: boolean) => React.ReactNode
  dropdownMenuContent:
    | React.ReactNode
    | ((close: () => void) => React.ReactNode)
  buttonClass?: string
  className?: string
  buttonDisabled?: boolean
  closeOnClick?: boolean
  withinOverflowContainer?: boolean
  popoverClassName?: string
}) {
  const {
    menuWidth,
    buttonContent,
    dropdownMenuContent,
    buttonClass,
    className,
    buttonDisabled,
    withinOverflowContainer,
    popoverClassName,
  } = props
  const [referenceElement, setReferenceElement] =
    useState<HTMLButtonElement | null>()
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>()
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    strategy: withinOverflowContainer ? 'fixed' : 'absolute',
  })
  return (
    <Popover className={clsx('relative inline-block text-left', className)}>
      {({ open, close }) => (
        <>
          <Popover.Button
            ref={setReferenceElement}
            className={clsx('flex items-center', buttonClass)}
            onClick={(e: any) => {
              e.stopPropagation()
            }}
            disabled={buttonDisabled}
          >
            {buttonContent(open)}
          </Popover.Button>

          <AnimationOrNothing show={open} animate={!withinOverflowContainer}>
            <Popover.Panel
              ref={setPopperElement}
              style={styles.popper}
              {...attributes.popper}
              className={clsx(
                'bg-canvas-0 ring-ink-1000 z-30 rounded-md px-4 py-2 shadow-lg ring-1 ring-opacity-5 focus:outline-none',
                menuWidth ?? 'w-36',
                popoverClassName
              )}
            >
              {typeof dropdownMenuContent === 'function'
                ? dropdownMenuContent(close)
                : dropdownMenuContent}
            </Popover.Panel>
          </AnimationOrNothing>
        </>
      )}
    </Popover>
  )
}
