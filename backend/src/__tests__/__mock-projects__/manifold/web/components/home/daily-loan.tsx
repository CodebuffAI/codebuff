import { useEffect, useState } from 'react'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { LoansModal } from 'web/components/profile/loans-modal'
import { api, requestLoan } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useHasReceivedLoanToday } from 'web/hooks/use-has-received-loan'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { Tooltip } from 'web/components/widgets/tooltip'
import { track } from 'web/lib/service/analytics'
import { DAY_MS } from 'common/util/time'
import { Button } from 'web/components/buttons/button'
import clsx from 'clsx'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { Row } from 'web/components/layout/row'
import { GiOpenChest, GiTwoCoins } from 'react-icons/gi'
import { Col } from 'web/components/layout/col'
import { TRADE_TERM } from 'common/envs/constants'

dayjs.extend(utc)
dayjs.extend(timezone)

export function DailyLoan(props: {
  user: User
  refreshPortfolio?: () => void
  showChest?: boolean
  className?: string
}) {
  const { user, showChest, refreshPortfolio, className } = props

  const [showLoansModal, setShowLoansModal] = useState(false)
  const [loaning, setLoaning] = useState(false)
  const [justReceivedLoan, setJustReceivedLoan] = usePersistentInMemoryState(
    false,
    `just-received-loan-${user.id}`
  )
  const { receivedLoanToday: receivedTxnLoan, checkTxns } =
    useHasReceivedLoanToday(user)
  const notEligibleForLoan = false //user.nextLoanCached < 1
  const receivedLoanToday = receivedTxnLoan || justReceivedLoan

  const getLoan = async () => {
    if (receivedLoanToday || notEligibleForLoan) {
      setShowLoansModal(true)
      return
    }
    setLoaning(true)
    const id = toast.loading('Requesting loan...')
    const res = await requestLoan().catch((e) => {
      console.error(e)
      toast.error('Error requesting loan')
      return null
    })
    if (res) {
      await checkTxns()
      toast.success(`${formatMoney(res.payout)} loan collected!`)
      setJustReceivedLoan(true)
    }
    toast.dismiss(id)
    if (!user.hasSeenLoanModal) setTimeout(() => setShowLoansModal(true), 1000)
    setLoaning(false)
    track('request loan', {
      amount: res?.payout,
    })

    if (refreshPortfolio) {
      // Wait for replication...
      setTimeout(refreshPortfolio, 1000)
    }
  }

  useEffect(() => {
    if (showLoansModal && !user.hasSeenLoanModal)
      api('me/update', { hasSeenLoanModal: true })
  }, [showLoansModal])

  const createdRecently = user.createdTime > Date.now() - 2 * DAY_MS
  if (createdRecently) {
    return null
  }
  if (showChest) {
    return (
      <Col
        className={clsx(
          className,
          'items-center',
          dailyStatsClass,
          receivedLoanToday || notEligibleForLoan
            ? ''
            : 'hover:bg-canvas-100 ring-[1.7px] ring-amber-300'
        )}
      >
        <Tooltip
          text={
            receivedLoanToday
              ? 'Loan already collected'
              : notEligibleForLoan
              ? 'Daily loans'
              : `Collect a loan on your ${TRADE_TERM}s`
          }
          placement={'bottom'}
        >
          <button disabled={loaning} onClick={getLoan}>
            <Row
              className={clsx(
                'items-center justify-center whitespace-nowrap px-1'
              )}
            >
              {receivedLoanToday || notEligibleForLoan ? (
                <GiOpenChest className="h-6 w-6 text-yellow-900" />
              ) : (
                <GiTwoCoins className="h-6 w-6 text-yellow-300" />
              )}
            </Row>
            <div className="text-ink-600 text-xs">Loan</div>
          </button>
        </Tooltip>
        {showLoansModal && (
          <LoansModal
            isOpen={showLoansModal}
            user={user}
            setOpen={setShowLoansModal}
          />
        )}
      </Col>
    )
  }
  return (
    <Button
      className={className}
      color={'gray-outline'}
      size={'2xs'}
      loading={loaning}
      disabled={loaning || receivedLoanToday || notEligibleForLoan}
      onClick={(e) => {
        e.stopPropagation()
        getLoan()
      }}
    >
      <Tooltip
        text={
          receivedLoanToday
            ? 'Loan already collected'
            : notEligibleForLoan
            ? 'Daily loans'
            : `Collect a loan on your ${TRADE_TERM}s`
        }
        placement={'top'}
      >
        Get loan
      </Tooltip>
      {showLoansModal && (
        <LoansModal
          isOpen={showLoansModal}
          user={user}
          setOpen={setShowLoansModal}
        />
      )}
    </Button>
  )
}
