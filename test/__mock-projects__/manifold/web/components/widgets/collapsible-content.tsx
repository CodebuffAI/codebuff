import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/react'
import clsx from 'clsx'
import { MouseEventHandler, useEffect, useRef, useState } from 'react'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'
import { Row } from '../layout/row'
import { Content } from './editor'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { Col } from 'web/components/layout/col'

export const LINE_HEIGHT = 26 // line height is 26px
export const SHOW_COLLAPSE_TRESHOLD = 180

export function ShowMoreLessButton(props: {
  onClick?: MouseEventHandler<any> | undefined
  isCollapsed: boolean
  className?: string
  howManyMore?: number
  moreWhat?: string
}) {
  const { onClick, isCollapsed, className, howManyMore, moreWhat = '' } = props
  const howManyMoreText = howManyMore ? howManyMore + ' ' : ''

  return (
    <button
      className={clsx(
        'text-primary-500 hover:text-primary-700 z-10 select-none text-sm',
        className
      )}
      onClick={onClick}
    >
      <Row className="items-center gap-0.5">
        {isCollapsed ? (
          <ChevronDownIcon className="h-4 w-4" />
        ) : (
          <ChevronUpIcon className="h-4 w-4" />
        )}
        {isCollapsed
          ? `Show ${howManyMoreText}more ${moreWhat}`
          : `Show less ${moreWhat}`}
      </Row>
    </button>
  )
}

export function CollapsibleContent(props: {
  content: JSONContent | string
  stateKey: string
  defaultCollapse?: boolean
  hideCollapse?: boolean
  mediaSize?: 'sm' | 'md' | 'lg'
  collapseLines?: number
  showMorePlacement?: 'top' | 'bottom'
}) {
  const {
    content,
    mediaSize,
    stateKey,
    defaultCollapse,
    hideCollapse,
    showMorePlacement = 'top',
  } = props
  const [shouldAllowCollapseOfContent, setShouldAllowCollapseOfContent] =
    useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useSafeLayoutEffect(() => {
    if (contentRef.current) {
      if (contentRef.current.offsetHeight > SHOW_COLLAPSE_TRESHOLD) {
        setShouldAllowCollapseOfContent(true)
      }
    }
  }, [contentRef.current?.offsetHeight])
  if (shouldAllowCollapseOfContent && !hideCollapse) {
    return (
      <ActuallyCollapsibleContent
        content={content}
        mediaSize={mediaSize}
        stateKey={stateKey}
        defaultCollapse={defaultCollapse}
        showMorePlacement={showMorePlacement}
      />
    )
  }
  return (
    <div ref={contentRef}>
      <Content size={mediaSize} content={content} />
    </div>
  )
}

// Moved to its own component to reduce unnecessary isCollapsed states in local storage
function ActuallyCollapsibleContent(props: {
  content: JSONContent | string
  stateKey: string
  showMorePlacement: 'top' | 'bottom'
  mediaSize?: 'sm' | 'md' | 'lg'
  defaultCollapse?: boolean
}) {
  const { content, mediaSize, stateKey, defaultCollapse, showMorePlacement } =
    props
  const [isCollapsed, setCollapsed] = usePersistentLocalState<boolean>(
    defaultCollapse ?? false,
    stateKey
  )
  useEffect(() => {
    if (defaultCollapse !== undefined) setCollapsed(defaultCollapse)
  }, [])

  return (
    <div>
      <div
        style={{ height: isCollapsed ? SHOW_COLLAPSE_TRESHOLD : 'auto' }}
        className="relative w-full overflow-hidden"
      >
        {showMorePlacement === 'top' && (
          <Row className="justify-end gap-2">
            <ShowMoreLessButton
              onClick={() => setCollapsed(!isCollapsed)}
              isCollapsed={isCollapsed}
            />
          </Row>
        )}
        <Content size={mediaSize} content={content} />
        {isCollapsed && (
          <Col className="from-canvas-0 via-canvas-0 absolute bottom-0 left-0 right-0 h-12 justify-end bg-gradient-to-t via-20% to-transparent" />
        )}
      </div>
      {isCollapsed && showMorePlacement === 'bottom' && (
        <button
          onClick={() => setCollapsed(!isCollapsed)}
          className="text-primary-600 hover:text-primary-700  hover:font-semibold"
        >
          Show more
        </button>
      )}
    </div>
  )
}
