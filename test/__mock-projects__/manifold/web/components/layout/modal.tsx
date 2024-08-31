import { Dialog, Transition } from '@headlessui/react'
import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Fragment, ReactNode, useEffect, useRef } from 'react'

export const MODAL_CLASS =
  'items-center gap-4 rounded-md bg-canvas-0 sm:px-8 px-4 py-6 text-ink-1000'
export const SCROLLABLE_MODAL_CLASS =
  'max-h-[70vh] min-h-[20rem] !overflow-auto'

// From https://tailwindui.com/components/application-ui/overlays/modals
export function Modal(props: {
  children: ReactNode
  open: boolean
  setOpen?: (open: boolean) => void
  size?: 'sm' | 'md' | 'lg' | 'xl'
  position?: 'center' | 'top' | 'bottom'
  className?: string
  onClose?: () => void
}) {
  const {
    children,
    position = 'center',
    open,
    setOpen,
    size = 'md',
    className,
    onClose,
  } = props

  const sizeClass = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-5xl',
  }[size]

  const positionClass = {
    center: 'sm:items-center',
    top: 'sm:items-start',
    bottom: '',
  }[position]

  const wasOpenRef = useRef(open)

  useEffect(() => {
    if (wasOpenRef.current && !open && onClose) {
      onClose()
    }
    wasOpenRef.current = open
  }, [open, onClose])

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        className="text-ink-1000 relative z-50"
        onClose={setOpen ?? (() => {})}
        // prevent modal from re-opening from bubbled event if Modal is child of the open button
        onClick={(e: any) => e.stopPropagation()}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-linear duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-linear duration-75"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          {/* background cover */}
          <div className="bg-canvas-100/75 fixed inset-0" />
        </Transition.Child>

        <Transition.Child
          as={Fragment}
          enter="ease-in sm:ease-out duration-150"
          enterFrom="opacity-0 sm:scale-95"
          enterTo="opacity-100 sm:scale-100"
          leave="ease-out sm:ease-in duration-75"
          leaveFrom="opacity-100 sm:scale-100"
          leaveTo="opacity-0 sm:scale-95"
        >
          <div className="fixed inset-0 overflow-y-auto pt-20 sm:p-0">
            <div
              className={clsx(
                'flex min-h-full items-end justify-center overflow-hidden',
                positionClass
              )}
            >
              <div
                className={clsx(
                  'relative w-full transform transition-all',
                  'lg:mx-6 lg:my-8',
                  sizeClass,
                  className
                )}
              >
                <div className="sr-only" tabIndex={0}>
                  focus trap
                </div>
                <Dialog.Panel>{children}</Dialog.Panel>
                {setOpen && (
                  <button
                    onClick={() => setOpen(false)}
                    className={clsx(
                      'text-ink-700 bottom-50 hover:text-primary-400 focus:text-primary-400 absolute -top-4 right-4 -translate-y-full cursor-pointer outline-none sm:right-0',
                      position === 'top' &&
                        'sm:-bottom-4 sm:top-auto sm:translate-y-full'
                    )}
                  >
                    <XIcon className="h-8 w-8" />
                    <div className="sr-only">Close</div>
                  </button>
                )}
              </div>
            </div>
          </div>
        </Transition.Child>
      </Dialog>
    </Transition.Root>
  )
}
