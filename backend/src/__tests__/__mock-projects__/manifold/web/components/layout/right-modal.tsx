import { Dialog, Transition } from '@headlessui/react'
import clsx from 'clsx'
import { Fragment, ReactNode } from 'react'
// From https://tailwindui.com/components/application-ui/overlays/modals
export function RightModal(props: {
  children: ReactNode
  open: boolean
  setOpen: (open: boolean) => void

  noAutoFocus?: boolean
  className?: string
}) {
  const { children, open, setOpen, className, noAutoFocus } = props

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        className="text-ink-1000 relative z-50"
        onClose={setOpen}
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
          <div className="fixed inset-0 p-0">
            <div
              className={clsx(
                'flex h-full flex-row justify-end overflow-hidden'
              )}
            >
              <Dialog.Panel
                className={clsx('grow-y transform transition-all ', className)}
              >
                {/* Hack to capture focus b/c headlessui dialog always focuses first element
                    and we don't want it to.
                */}
                {noAutoFocus && <div tabIndex={0} />}
                {children}
              </Dialog.Panel>
            </div>
          </div>
        </Transition.Child>
      </Dialog>
    </Transition.Root>
  )
}
