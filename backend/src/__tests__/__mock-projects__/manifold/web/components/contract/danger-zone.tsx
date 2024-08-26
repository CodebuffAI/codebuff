import { Contract, MINUTES_ALLOWED_TO_UNRESOLVE } from 'common/contract'
import { useEffect } from 'react'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { Button } from '../buttons/button'
import { DeleteMarketButton } from '../buttons/delete-market-button'
import { Row } from '../layout/row'
import { WEEK_MS } from 'common/util/time'
import dayjs from 'dayjs'
import { UnresolveButton } from '../buttons/unresolve-button'

export function DangerZone(props: {
  contract: Contract
  showResolver: boolean
  setShowResolver: (showResolver: boolean) => void
  showReview: boolean
  setShowReview: (showReview: boolean) => void
  userHasBet: boolean
  hasReviewed?: boolean
}) {
  const {
    contract,
    showResolver,
    setShowResolver,
    showReview,
    setShowReview,
    userHasBet,
    hasReviewed,
  } = props
  const {
    closeTime,
    creatorId,
    outcomeType,
    mechanism,
    isResolved,
    resolution,
    resolutionTime,
    uniqueBettorCount,
  } = contract

  const isAdmin = useAdmin()
  const isMod = useTrusted()
  const user = useUser()
  const isCreator = user?.id === creatorId
  const isClosed = !!closeTime && closeTime < Date.now()

  const canReview =
    !!user &&
    !isCreator &&
    isResolved &&
    outcomeType !== 'STONK' &&
    mechanism !== 'none' &&
    !hasReviewed

  const canDelete =
    isCreator &&
    isResolved &&
    resolution === 'CANCEL' &&
    (!uniqueBettorCount || uniqueBettorCount < 2)

  const canResolve =
    (isCreator || isAdmin || isMod) &&
    !isResolved &&
    outcomeType !== 'STONK' &&
    mechanism !== 'none'

  const now = dayjs().utc()
  const creatorCanUnresolve =
    isCreator &&
    resolutionTime &&
    now.diff(dayjs(resolutionTime), 'minute') < MINUTES_ALLOWED_TO_UNRESOLVE

  const canUnresolve =
    (isAdmin || isMod || (isCreator && creatorCanUnresolve)) && isResolved

  useEffect(() => {
    if (
      canReview &&
      userHasBet &&
      // resolved less than week ago
      Date.now() - (contract.resolutionTime ?? 0) < WEEK_MS
    ) {
      setShowReview(true)
    }
  }, [canReview, userHasBet, contract.resolutionTime])

  useEffect(() => {
    // Close resolve panel if you just resolved it.
    if (isResolved) setShowResolver(false)
    // open by default if it is closed
    else if (canResolve && isClosed) {
      setShowResolver(true)
    }
  }, [isAdmin, isCreator, isMod, closeTime, isResolved])

  const highlightResolver = isClosed && !showResolver

  if (!user) return null
  if (!canReview && !canDelete && !canResolve && !canUnresolve) return null

  return (
    <Row className="my-2 w-full flex-wrap justify-end gap-2">
      {canReview && !showReview && (
        <Button
          color="gray"
          size="2xs"
          className="self-end"
          onClick={() => setShowReview(true)}
        >
          Review
        </Button>
      )}

      {canDelete && <DeleteMarketButton contractId={contract.id} />}
      {canResolve && !showResolver && (
        <Button
          color={highlightResolver ? 'red' : 'gray'}
          size="2xs"
          onClick={() => setShowResolver(!showResolver)}
        >
          {isCreator
            ? 'Resolve'
            : isAdmin
            ? 'Admin resolve'
            : isMod
            ? 'Mod resolve'
            : ''}
        </Button>
      )}
      {canUnresolve && <UnresolveButton contractId={contract.id} />}
    </Row>
  )
}
