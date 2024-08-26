import {
  arrow,
  autoUpdate,
  flip,
  offset,
  Placement,
  safePolygon,
  shift,
  useFloating,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { Transition } from '@headlessui/react'
import { ReactNode, useRef, useState } from 'react'

// See https://floating-ui.com/docs/react-dom

export function Tooltip(props: {
  text: string | false | undefined | null | ReactNode
  children: ReactNode
  className?: string
  placement?: Placement
  noTap?: boolean
  noFade?: boolean
  hasSafePolygon?: boolean
  suppressHydrationWarning?: boolean
}) {
  const {
    text,
    children,
    className,
    noTap,
    noFade,
    hasSafePolygon,
    suppressHydrationWarning,
  } = props

  const arrowRef = useRef(null)

  const [open, setOpen] = useState(false)

  const {
    x,
    y,
    reference,
    floating,
    strategy,
    middlewareData,
    context,
    placement,
  } = useFloating({
    open: open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    placement: props.placement ?? 'top',
    middleware: [
      offset(8),
      flip(),
      shift({ padding: 4 }),
      arrow({ element: arrowRef }),
    ],
  })

  const { x: arrowX, y: arrowY } = middlewareData.arrow ?? {}

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, {
      mouseOnly: noTap,
      handleClose: hasSafePolygon ? safePolygon({ buffer: -0.5 }) : null,
    }),
    useRole(context, { role: 'tooltip' }),
  ])
  // which side of tooltip arrow is on. like: if tooltip is top-left, arrow is on bottom of tooltip
  const arrowSide = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  }[placement.split('-')[0]] as string

  return text ? (
    <>
      <span
        suppressHydrationWarning={suppressHydrationWarning}
        className={className}
        ref={reference}
        {...getReferenceProps()}
      >
        {children}
      </span>
      {/* conditionally render tooltip and fade in/out */}
      <Transition
        show={open}
        enter="transition ease-out duration-50"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave={noFade ? '' : 'transition ease-in duration-150'}
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        // div attributes
        role="tooltip"
        ref={floating}
        style={{ position: strategy, top: y ?? 0, left: x ?? 0 }}
        className="text-ink-0 bg-ink-700 z-20 w-max max-w-xs whitespace-normal rounded px-2 py-1 text-center text-sm font-medium"
        suppressHydrationWarning={suppressHydrationWarning}
        {...getFloatingProps()}
      >
        {text}
        <div
          ref={arrowRef}
          className="bg-ink-700 absolute h-2 w-2 rotate-45"
          style={{
            top: arrowY != null ? arrowY : '',
            left: arrowX != null ? arrowX : '',
            right: '',
            bottom: '',
            [arrowSide]: '-4px',
          }}
        />
      </Transition>
    </>
  ) : (
    <>{children}</>
  )
}
