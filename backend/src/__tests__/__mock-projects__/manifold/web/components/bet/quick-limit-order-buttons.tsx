import clsx from 'clsx'
import toast from 'react-hot-toast'
import { useState } from 'react'

import { APIError } from 'common/api/utils'
import { CPMMContract, MultiContract } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import { DAY_MS } from 'common/util/time'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import { track } from 'web/lib/service/analytics'
import { AddFundsModal } from '../add-funds-modal'
import { Answer } from 'common/answer'
import { TRADE_TERM } from 'common/envs/constants'

export const QuickLimitOrderButtons = (props: {
  contract: CPMMContract | MultiContract
  answer?: Answer
  className?: string
}) => {
  const { contract, answer, className } = props
  if (!answer && contract.mechanism === 'cpmm-multi-1') {
    throw new Error('Answer must be provided for multi contracts')
  }

  const unroundedProb = answer ? answer.prob : (contract as CPMMContract).prob
  const prob = Math.round(unroundedProb * 100) / 100
  const amount = 100

  const user = useUser()
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES')
  const [buyModalOpen, setBuyModalOpen] = useState(false)

  async function submitBet(outcome: 'YES' | 'NO') {
    if (!user) return
    if (user.balance < amount) {
      setError('Insufficient balance')
      setBuyModalOpen(true)
      return
    }

    setError(undefined)
    setIsSubmitting(true)
    setOutcome(outcome)

    // const answerId = multiProps?.answerToBuy.id
    const expiresAt = Date.now() + DAY_MS

    await api(
      'bet',
      removeUndefinedProps({
        outcome,
        amount,
        contractId: contract.id,
        limitProb: prob,
        expiresAt,
        answerId: answer?.id,
      })
    )
      .then((r) => {
        console.log(`placed ${TRADE_TERM}. Result:`, r)
        setIsSubmitting(false)
        toast.success(
          `Placed order for ${formatMoney(
            amount
          )} ${outcome} at ${formatPercent(prob)}`
        )
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.message.toString())
        } else {
          console.error(e)
          setError(`Error placing ${TRADE_TERM}`)
        }
        setIsSubmitting(false)
      })

    // TODO: Twomba tracking bet terminology
    await track(
      'bet',
      removeUndefinedProps({
        location: 'quick bet panel',
        outcomeType: contract.outcomeType,
        slug: contract.slug,
        contractId: contract.id,
        amount,
        outcome,
        limitProb: prob,
        isLimitOrder: true,
        answerId: answer?.id,
      })
    )
  }

  return (
    <Col
      className={clsx(className, 'border-ink-200 my-2 gap-2 rounded-lg py-2')}
    >
      <Row className="items-center gap-2">
        <div className="text-ink-600">
          Quick limit order{' '}
          <InfoTooltip
            text={`Offer to buy ${formatMoney(
              amount
            )} YES or NO at the current market price of ${formatPercent(
              prob
            )}. If no one takes your ${TRADE_TERM}, your offer will expire in 24 hours.`}
          />
        </div>
        <Button
          size="xs"
          color="gray-outline"
          loading={outcome === 'YES' && isSubmitting}
          className="w-24 whitespace-nowrap font-semibold"
          onClick={() => submitBet('YES')}
        >
          {formatMoney(amount)} YES
        </Button>
        <Button
          size="xs"
          color="gray-outline"
          loading={outcome === 'NO' && isSubmitting}
          className="w-24 whitespace-nowrap font-semibold"
          onClick={() => submitBet('NO')}
        >
          {formatMoney(amount)} NO
        </Button>
      </Row>
      {error && <div className="text-red-500">{error}</div>}
      {buyModalOpen && <AddFundsModal open={true} setOpen={setBuyModalOpen} />}
    </Col>
  )
}
