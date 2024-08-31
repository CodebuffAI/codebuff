import clsx from 'clsx'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

export default function LoadingUserRows() {
  return (
    <Col className="min-h-screen w-full gap-2">
      <LoadingUserRow />
      <LoadingUserRow />
      <LoadingUserRow />
      <LoadingUserRow />
      <LoadingUserRow />
    </Col>
  )
}

export function LoadingUserRow() {
  // You can add any UI inside Loading, including a Skeleton.
  return (
    <div className="border-ink-200 flex w-full animate-pulse border-b p-2 last:border-none sm:rounded-md sm:border-none">
      <Row className="w-full  justify-between gap-1 sm:gap-4">
        <Row className={clsx('sm:w-[calc(100%-12rem] w-full gap-2 sm:gap-4')}>
          <span className={'mr-6'}>#</span>
          <div className="h-6 w-6 rounded-full bg-gray-500" />
          <div className="h-5 w-32 rounded-full bg-gray-500" />
        </Row>
        <div className="">
          <div className="h-5 w-12 rounded-full bg-gray-500" />
        </div>
      </Row>
    </div>
  )
}
