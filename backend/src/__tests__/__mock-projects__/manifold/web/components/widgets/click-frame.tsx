import clsx from 'clsx'
import { MouseEventHandler, forwardRef } from 'react'

/**
 *  A clickable container that can include buttons and links that work like you want.
 *  You can even put ClickFrames inside ClickFrames.
 */
export const ClickFrame = forwardRef(
  (
    props: {
      children: React.ReactNode
      onClick: MouseEventHandler<HTMLDivElement>
      className?: string
      onMouseEnter?: MouseEventHandler<HTMLDivElement>
      onMouseLeave?: MouseEventHandler<HTMLDivElement>
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    const { children, onClick, className, onMouseEnter, onMouseLeave } = props

    return (
      <div
        className={clsx('stop-prop cursor-pointer', className)}
        tabIndex={-1}
        onClick={onClick}
        ref={ref}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div
          // pointer-events:none causes click events to fall through to parent.
          // we put pointer-events:auto on links, buttons, and elements with class stop-prop,
          // so they get caught by the stopPropagation below
          className="pointer-events-none contents [&_.stop-prop]:pointer-events-auto [&_a]:pointer-events-auto [&_button]:pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    )
  }
)
