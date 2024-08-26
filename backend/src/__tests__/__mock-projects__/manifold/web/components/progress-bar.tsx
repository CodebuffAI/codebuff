import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { Row } from './layout/row'

export const ProgressBar = (props: {
  value: number
  max: number
  className?: string
}) => {
  const { value, max, className } = props
  const percentage = Math.min((value / max) * 100, 100)
  return (
    <Row className={'w-full justify-center'}>
      <Col className={clsx('bg-ink-200 h-2.5 w-full rounded-full', className)}>
        <div
          className={'bg-primary-500 h-full rounded-full'}
          style={{ width: `${percentage}%` }}
        />
      </Col>
    </Row>
  )
}
