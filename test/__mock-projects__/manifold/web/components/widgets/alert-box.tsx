import { ExclamationIcon } from '@heroicons/react/solid'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import clsx from 'clsx'
import { ReactNode } from 'react'

export function AlertBox(props: {
  title: string
  className?: string
  children?: ReactNode
}) {
  const { title, children, className } = props
  return (
    <Col
      className={clsx(
        'border-warning bg-warning/10 w-full rounded-md border p-4',
        className
      )}
    >
      <Row className="flex-shrink-0">
        <ExclamationIcon className="fill-warning h-5 w-5" aria-hidden />

        <div className="ml-3">
          <h3 className="text-ink-800 text-sm font-medium">{title}</h3>
        </div>
      </Row>

      {children && (
        <div className="text-ink-700 mt-2 whitespace-pre-line text-sm">
          {children}
        </div>
      )}
    </Col>
  )
}
