import { DotsHorizontalIcon } from '@heroicons/react/solid'
import { Fragment, ReactNode, useEffect, useState } from 'react'
import { usePopper } from 'react-popper'
import { Popover, Transition } from '@headlessui/react'
import clsx from 'clsx'
import { createPortal } from 'react-dom'
import Link from 'next/link'

export type DropdownItem = {
  name: string
  buttonContent?: ReactNode
  icon?: ReactNode
  onClick?: () => void | Promise<void>
  isLink?: boolean
  linkProps?: React.AnchorHTMLAttributes<HTMLAnchorElement>
  className?: string
  nonButtonContent?: ReactNode
}

// NOTE: you can't conditionally render any of the items from a useEffect hook, or you'll get hydration errors
export default function DropdownMenu(props: {
  items: DropdownItem[]
  icon?: ReactNode
  menuWidth?: string
  buttonClass?: string
  className?: string
  menuItemsClass?: string
  buttonDisabled?: boolean
  selectedItemName?: string
  closeOnClick?: boolean
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
    selectedItemName,
    closeOnClick,
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

  // Added mounted state
  const [mounted, setMounted] = useState(false)

  // Added useEffect for mounted state
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  return (
    <Popover className={clsx('relative inline-block text-left', className)}>
      {({ open, close }) => (
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
          {mounted &&
            createPortal(
              <AnimationOrNothing
                show={open}
                animate={!withinOverflowContainer}
              >
                <Popover.Panel
                  ref={setPopperElement}
                  style={styles.popper}
                  {...attributes.popper}
                  className={clsx(
                    'bg-canvas-0 ring-ink-1000 z-30 mt-2 rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none',
                    menuWidth ?? 'w-34',
                    menuItemsClass,
                    'py-1'
                  )}
                >
                  {items.map((item) => (
                    <div key={item.name}>
                      {!!item.nonButtonContent ? (
                        item.nonButtonContent
                      ) : item.isLink &&
                        item.linkProps &&
                        item.linkProps.href ? (
                        <Link
                          href={item.linkProps?.href || '#'}
                          {...item.linkProps}
                          className={clsx(
                            selectedItemName && item.name === selectedItemName
                              ? 'bg-primary-100'
                              : 'hover:bg-ink-100 hover:text-ink-900',
                            'text-ink-700',
                            'flex w-full items-center gap-2 px-4 py-2 text-left text-sm'
                          )}
                        >
                          {item.icon && <div className="w-5">{item.icon}</div>}
                          {item.buttonContent ?? item.name}
                        </Link>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            if (item.onClick) {
                              item.onClick()
                            }
                            if (closeOnClick) {
                              close()
                            }
                          }}
                          className={clsx(
                            selectedItemName && item.name === selectedItemName
                              ? 'bg-primary-100'
                              : 'hover:bg-ink-100 hover:text-ink-900',
                            'text-ink-700',
                            'flex w-full items-center gap-2 px-4 py-2 text-left text-sm',
                            item.className
                          )}
                        >
                          {item.icon && <div className="w-5">{item.icon}</div>}
                          {item.buttonContent ?? item.name}
                        </button>
                      )}
                    </div>
                  ))}
                </Popover.Panel>
              </AnimationOrNothing>,
              document.body
            )}
        </>
      )}
    </Popover>
  )
}
export const AnimationOrNothing = (props: {
  animate: boolean
  show: boolean
  children: ReactNode
}) => {
  return props.animate ? (
    <Transition
      as={Fragment}
      enter="transition ease-out duration-100"
      enterFrom="transform opacity-0 scale-95"
      enterTo="transform opacity-100 scale-100"
      leave="transition ease-in duration-75"
      leaveFrom="transform opacity-100 scale-100"
      leaveTo="transform opacity-0 scale-95"
      show={props.show}
    >
      {props.children}
    </Transition>
  ) : (
    <>{props.children}</>
  )
}
