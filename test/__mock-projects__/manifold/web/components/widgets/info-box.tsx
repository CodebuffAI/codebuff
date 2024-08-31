import clsx from 'clsx'
import { InformationCircleIcon } from '@heroicons/react/solid'

import { Linkify } from './linkify'
import { ReactNode } from 'react'

export function InfoBox(props: {
  title: string
  text?: string
  children?: ReactNode
  className?: string
}) {
  const { title, text, className } = props
  return (
    <div className={clsx('bg-canvas-50 rounded-md p-4', className)}>
      <div className="flex">
        <div className="flex-shrink-0">
          <InformationCircleIcon
            className="text-ink-400 h-5 w-5"
            aria-hidden="true"
          />
        </div>
        <div className="ml-3">
          {title && (
            <h3 className="text-ink-1000 mb-2 text-sm font-medium">{title}</h3>
          )}
          <div className="text-ink-600 text-sm">
            {text && <Linkify text={text} />}
            {props.children}
          </div>
        </div>
      </div>
    </div>
  )
}
