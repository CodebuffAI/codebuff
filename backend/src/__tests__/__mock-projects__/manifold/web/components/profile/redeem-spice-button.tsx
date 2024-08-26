import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'
import { Button } from '../buttons/button'
import { RedeemSpiceModal } from '../redeem-spice-modal'
import { CoinNumber } from '../widgets/manaCoinNumber'
import { Row } from '../layout/row'
import clsx from 'clsx'

export function RedeemSpiceButton(props: {
  userId?: string
  className?: string
  spice?: number | null
}) {
  const { userId, className, spice } = props
  const [open, setOpen] = useState(false)
  const user = useUser()
  const disabled = !spice || spice <= 0
  if (!userId || user?.id !== userId) return null
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="md"
        color="amber-outline"
        className={clsx('h-min sm:inline-flex', className)}
        disabled={disabled}
      >
        <Row className="gap-1">
          Redeem{' '}
          <CoinNumber
            amount={spice ?? undefined}
            coinType="spice"
            coinClassName={disabled ? 'grayscale opacity-50' : ''}
          />
        </Row>
      </Button>
      {open && <RedeemSpiceModal open={open} setOpen={setOpen} user={user} />}
    </>
  )
}
