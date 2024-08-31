import { DotsHorizontalIcon } from '@heroicons/react/solid'
import { ReactNode, useState } from 'react'
import { Popover } from '@headlessui/react'
import clsx from 'clsx'
import { usePopper } from 'react-popper'
import { Col } from 'web/components/layout/col'
import { AnimationOrNothing } from 'web/components/comments/dropdown-menu'

// NOTE: you can't conditionally render any of the items from a useEffect hook, or you'll get hydration errors
export default function DropdownMenu(props: {
  items: ReactNode[]
  icon?: ReactNode
  menuWidth?: string
  buttonClass?: string
  className?: string
  menuItemsClass?: string
  buttonDisabled?: boolean
  withinOverflowContainer?: boolean
  buttonContent?: (open: boolean) => ReactNode
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
  } = props
  const [referenceElement, setReferenceElement] =
    useState<HTMLButtonElement | null>()
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>()
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    strategy: withinOverflowContainer ? 'fixed' : 'absolute',
  })
  const icon = props.icon ?? (
    <DotsHorizontalIcon className="h-5 w-5" aria-hidden="true" />
  )

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
            {buttonContent ? buttonContent(open) : icon}
          </Popover.Button>

          <AnimationOrNothing show={open} animate={!withinOverflowContainer}>
            <Popover.Panel
              ref={setPopperElement}
              style={styles.popper}
              {...attributes.popper}
              className={clsx(
                'bg-canvas-0 ring-ink-1000 z-30 mt-2 rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none',
                menuWidth ?? 'w-34',
                menuItemsClass,
                'p-1'
              )}
            >
              <Col className={'gap-1'}>{items.map((item) => item)}</Col>
            </Popover.Panel>
          </AnimationOrNothing>
        </>
      )}
    </Popover>
  )
}
