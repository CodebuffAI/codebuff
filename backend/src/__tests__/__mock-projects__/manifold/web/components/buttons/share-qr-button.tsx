import clsx from 'clsx'
import { Contract } from 'common/contract'
import { getShareUrl } from 'common/util/share'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { Modal } from '../layout/modal'
import { QRCode } from '../widgets/qr-code'
import { Button } from './button'

export function ShareQRButton(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props
  const user = useUser()
  const shareUrl = getShareUrl(contract, user?.username)

  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        color="gray-outline"
        size="xs"
        className={clsx('gap-1', className)}
        onClick={() => setOpen(true)}
      >
        QR
      </Button>
      <Modal size="sm" open={open} setOpen={setOpen}>
        <div className="flex flex-col items-center">
          <QRCode
            url={shareUrl}
            width={250}
            height={250}
            className="self-center"
          />
        </div>
      </Modal>
    </>
  )
}
