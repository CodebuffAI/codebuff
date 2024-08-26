import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { EyeIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { TRADE_TERM } from 'common/envs/constants'

export const WatchMarketModal = (props: {
  open: boolean
  setOpen: (b: boolean) => void
  title?: string
}) => {
  const { open, setOpen, title } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="bg-canvas-0 items-center gap-4 rounded-md px-8 py-6">
        <EyeIcon className={clsx('h-20 w-20')} aria-hidden="true" />
        <span className="text-xl">{title ? title : 'Watching questions'}</span>
        <Col className={'gap-2'}>
          <span className={'text-primary-700'}>• What is watching?</span>
          <span className={'ml-2'}>
            Watching a question means you'll receive a notification when it
            resolves. You automatically start watching a question if you comment
            on it, {TRADE_TERM} on it, or click the watch button.
          </span>
        </Col>
      </Col>
    </Modal>
  )
}
