import { track } from 'web/lib/service/analytics'
import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { redeemBoost } from 'web/lib/api/api'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Button } from '../buttons/button'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export function ClaimButton(props: {
  adId: string
  reward: number
  disabled: boolean
  className?: string
  onClaim: () => void
}) {
  const { adId, reward, disabled, className, onClaim } = props

  const [claimed, setClaimed] = usePersistentInMemoryState(
    false,
    `claimed-boost-${adId}`
  )
  const [loading, setLoading] = useState(false)

  return (
    <Button
      className={clsx(
        'disabled:bg-canvas-50 disabled:text-ink-800 h-min disabled:cursor-default disabled:bg-none',
        'ml-1',
        className
      )}
      size="xl" // don't make it smaller!!!
      color="gold"
      disabled={disabled || loading || claimed}
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        setLoading(true)
        try {
          onClaim()
          await redeemBoost({ adId })
          toast.success(`Boost claimed! +${formatMoney(reward)}`)
          setClaimed(true)
          track('claim boost', { adId })
        } catch (err) {
          toast.error(
            (err as any).message ??
              (typeof err === 'string' ? err : 'Error claiming boost')
          )
        } finally {
          setLoading(false)
        }
      }}
    >
      {claimed ? (
        'Claimed!'
      ) : loading ? (
        <LoadingIndicator size={'sm'} />
      ) : (
        `Claim ${formatMoney(reward)} boost`
      )}
    </Button>
  )
}
