import clsx from 'clsx'
import { ContractComment } from 'common/comment'
import { BountiedQuestionContract } from 'common/contract'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useState } from 'react'
import { FaXmark } from 'react-icons/fa6'
import { TbMoneybag } from 'react-icons/tb'
import { api, cancelBounty } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { BuyAmountInput } from '../widgets/amount-input'
import { InfoTooltip } from '../widgets/info-tooltip'

export function BountyLeft(props: {
  bountyLeft: number
  totalBounty: number
  inEmbed?: boolean
}) {
  const { bountyLeft, totalBounty, inEmbed } = props
  if (!bountyLeft || bountyLeft < 1) {
    return (
      <span>
        No bounty left
        <InfoTooltip
          text={`The creator has already paid out the max amount of bounty.`}
          className="z-50"
          tooltipParams={{ placement: 'bottom-end' }}
        />
      </span>
    )
  }
  if (inEmbed) {
    return (
      <Col className="text-ink-500">
        <Row className="items-center gap-2 font-normal">
          <span className="text-lg font-semibold text-teal-600">
            {formatMoney(bountyLeft)}
          </span>
          <span> / {totalBounty}</span>{' '}
        </Row>
        <div className="text-sm">bounty left</div>
      </Col>
    )
  }
  return (
    <span>
      <span className="font-semibold text-teal-600">
        {formatMoney(bountyLeft)}
      </span>
      <span className="text-ink-500 text-xs"> / {totalBounty} bounty left</span>{' '}
      <InfoTooltip
        text={`The bounty that the creator has left to pay out.`}
        className="z-50"
        tooltipParams={{ placement: 'bottom-end' }}
        size="sm"
      />
    </span>
  )
}

export function AwardBountyButton(props: {
  contract: BountiedQuestionContract
  comment: ContractComment
  onAward: (bountyTotal: number) => void
  user: User
  disabled: boolean
  buttonClassName?: string
}) {
  const { contract, comment, onAward, user, disabled, buttonClassName } = props
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const { bountyLeft } = contract
  const { bountyAwarded } = comment
  const [amount, setAmount] = useState<number | undefined>(bountyLeft)
  const [loading, setLoading] = useState(false)
  if (!user || user.id !== contract.creatorId) {
    return <></>
  }

  async function onAwardBounty() {
    if (amount) {
      setLoading(true)
      await api('market/:contractId/award-bounty', {
        contractId: contract.id,
        commentId: comment.id,
        amount: amount,
      })
        .then(() => {
          setOpen(false)
          setAmount(bountyLeft - amount)
          onAward((bountyAwarded ?? 0) + amount)
        })
        .catch((e) => {
          setError(e.message)
        })
      setLoading(false)
    }
  }
  return (
    <>
      <Button
        className={clsx('py-1 text-xs', buttonClassName)}
        color={'gray-outline'}
        size="xs"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
      >
        Award bounty
      </Button>
      <Modal open={open} setOpen={setOpen}>
        <Col className={MODAL_CLASS}>
          <div className="text-[150px]">🏅</div>
          <span>
            Award <b>{comment.userName}</b> a bounty
          </span>
          <BuyAmountInput
            amount={amount}
            onChange={(newAmount) => setAmount(newAmount)}
            error={error}
            setError={setError}
            minimumAmount={1}
            maximumAmount={bountyLeft}
            disregardUserBalance={true}
          />
          <Button
            size="lg"
            className="w-full"
            disabled={!!error}
            onClick={onAwardBounty}
            loading={loading}
          >
            Award {amount ? formatMoney(amount) : ''}
          </Button>
        </Col>
      </Modal>
    </>
  )
}

export function AddBountyButton(props: {
  contract: BountiedQuestionContract
  buttonClassName?: string
}) {
  const { contract, buttonClassName } = props
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [amount, setAmount] = useState<number | undefined>(undefined)

  async function onAddBounty() {
    if (amount) {
      setIsSubmitting(true)
      await api('market/:contractId/add-bounty', {
        contractId: contract.id,
        amount: amount,
      })
      setIsSubmitting(false)
      setOpen(false)
    }
  }

  return (
    <>
      <Button
        className={clsx(buttonClassName, 'group gap-1')}
        color={'green-outline'}
        onClick={() => setOpen(true)}
      >
        <TbMoneybag className="h-5 w-5 fill-teal-300 stroke-teal-600 group-hover:fill-none group-hover:stroke-current" />
        Add bounty
      </Button>
      <Modal open={open} setOpen={setOpen}>
        <Col className={MODAL_CLASS}>
          <h1 className="text-xl">Add to the bounty</h1>
          <BuyAmountInput
            amount={amount}
            onChange={(newAmount) => setAmount(newAmount)}
            error={error}
            setError={setError}
          />
          <Button
            size="lg"
            className="w-full"
            loading={isSubmitting}
            disabled={isSubmitting || !!error || !amount}
            onClick={onAddBounty}
          >
            Add {amount ? formatMoney(amount) : ''}
          </Button>
        </Col>
      </Modal>
    </>
  )
}

export function CancelBountyButton(props: {
  contract: BountiedQuestionContract
  disabled?: boolean
}) {
  const { contract, disabled } = props
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function onCancel() {
    setIsSubmitting(true)
    cancelBounty({
      contractId: contract.id,
    }).finally(() => {
      setIsSubmitting(false)
    })
  }

  return (
    <ConfirmationButton
      openModalBtn={{
        label: 'Close bounty',
        size: 'sm',
        color: 'gray-outline',
        disabled: isSubmitting || disabled,
        icon: <FaXmark className="mr-1 h-5 w-5" />,
      }}
      cancelBtn={{
        label: 'Cancel',
        color: 'gray',
        disabled: isSubmitting,
      }}
      submitBtn={{
        label: 'Yes, close bounty',
        color: 'indigo',
        isSubmitting,
      }}
      onSubmit={onCancel}
    >
      <Row className="items-center gap-2 text-xl">
        <div className="text-3xl">🤔</div>
        Are you sure?
      </Row>

      <p>
        If you decide to close this bounty, the remaining money will be returned
        to you. Please take a moment to ensure that everyone who contributed has
        been fairly compensated.
      </p>
    </ConfirmationButton>
  )
}
