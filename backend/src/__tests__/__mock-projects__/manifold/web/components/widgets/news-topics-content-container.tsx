import { ReactNode } from 'react'
import { Subtitle } from 'web/components/widgets/subtitle'
import clsx from 'clsx'
import { Col } from '../layout/col'

export const NewsTopicsContentContainer = (props: {
  className?: string
  containerContent: ReactNode
  header?: string
}) => {
  const { className, containerContent, header } = props

  return (
    <Col
      className={clsx(
        'border-ink-300 bg-canvas-0 m-0 mb-4 rounded-lg border object-contain px-3 py-1',
        className
      )}
    >
      {header && <Subtitle className="!mt-0">{header}</Subtitle>}
      {containerContent}
    </Col>
  )
}
