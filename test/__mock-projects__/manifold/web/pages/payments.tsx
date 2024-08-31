import { Page } from 'web/components/layout/page'
import { ManaPayTxn } from 'common/txn'
import {
  useAllManaPayments,
  useManaPayments,
} from 'web/hooks/use-mana-payments'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useEffect, useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { SelectUsers } from 'web/components/select-users'
import { DisplayUser } from 'common/api/user-types'
import { AmountInput } from 'web/components/widgets/amount-input'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'
import { ENV_CONFIG, isAdminId } from 'common/envs/constants'
import { uniq } from 'lodash'
import { useDisplayUserById, useUsers } from 'web/hooks/use-user-supabase'
import { UserAvatarAndBadge, UserLink } from 'web/components/widgets/user-link'
import { QrcodeIcon, XIcon } from '@heroicons/react/outline'
import { User } from 'web/lib/firebase/users'
import { Avatar } from 'web/components/widgets/avatar'
import { formatMoney, formatSpice } from 'common/util/format'
import { Linkify } from 'web/components/widgets/linkify'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { SEO } from 'web/components/SEO'
import { useCanSendMana } from 'web/hooks/use-can-send-mana'
import { QRCode } from 'web/components/widgets/qr-code'
import { CopyLinkRow } from 'web/components/buttons/copy-link-button'
import { useRouter } from 'next/router'
import { filterDefined } from 'common/util/array'
import { UserHovercard } from 'web/components/user/user-hovercard'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'

export default function Payments() {
  const { payments, load } = useAllManaPayments()
  return (
    <Page trackPageView={'managrams page'}>
      <SEO
        title="Managrams"
        description="See all mana transfers (managrams!) between users."
        url="/payments"
      />
      <Col>
        <span className={'text-primary-700 py-4 text-2xl'}>Managrams</span>
        {payments ? (
          <PaymentsContent payments={payments} forUser={null} refresh={load} />
        ) : (
          <LoadingIndicator />
        )}
      </Col>
    </Page>
  )
}
export const UserPayments = (props: { userId: string }) => {
  const { userId } = props
  const user = useDisplayUserById(userId)
  const { payments, load } = useManaPayments(userId)
  return (
    <div className="flex h-full flex-col items-center justify-center">
      {payments ? (
        <PaymentsContent payments={payments} forUser={user} refresh={load} />
      ) : (
        <LoadingIndicator />
      )}
    </div>
  )
}
export const PaymentsContent = (props: {
  payments: ManaPayTxn[]
  forUser: DisplayUser | undefined | null
  refresh: () => void
}) => {
  const { payments, forUser, refresh } = props
  const user = useUser()
  const users = useUsers(
    uniq(payments.map((payment) => [payment.fromId, payment.toId]).flat())
  )

  const [showPayModal, setShowPayModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)

  const router = useRouter()
  const { a, msg } = router.query
  // ios adds a query param that breaks the message.
  const defaultMessage =
    msg && (msg as string).replace(/\?nativePlatform=ios/g, '')

  useEffect(() => {
    if (router.isReady) setShowPayModal(a != undefined)
  }, [router.isReady])

  useEffect(() => {
    if (!showPayModal) setTimeout(() => refresh(), 100)
  }, [showPayModal])
  return (
    <Col className={'w-full'}>
      <Row className={'mb-4 gap-4'}>
        <Button
          onClick={() => setShowPayModal(true)}
          color={'indigo-outline'}
          size="xl"
        >
          Send
        </Button>
        <Button
          onClick={() => setShowQRModal(true)}
          color="indigo-outline"
          size="xl"
        >
          {user && user.id === forUser?.id && (
            <span className="mr-1">Receive</span>
          )}
          <QrcodeIcon className="h-5 w-5" />
        </Button>
      </Row>
      {payments.length === 0 ? (
        <span className="text-ink-500">No Payments</span>
      ) : (
        <PaymentCards
          payments={payments}
          users={filterDefined(users ?? [])}
          forUser={forUser}
        />
      )}
      {user && (
        <>
          {router.isReady && (
            <PaymentsModal
              toUser={
                forUser
                  ? forUser.id === user.id
                    ? undefined
                    : forUser
                  : undefined
              }
              fromUser={user}
              show={showPayModal}
              setShow={setShowPayModal}
              defaultMessage={defaultMessage}
              defaultAmount={typeof a === 'string' ? parseInt(a) : undefined}
            />
          )}
          <QRModal
            user={forUser ?? user}
            show={showQRModal}
            setShow={setShowQRModal}
          />
        </>
      )}
    </Col>
  )
}

const PaymentCards = (props: {
  payments: ManaPayTxn[]
  users: DisplayUser[] | undefined
  forUser: DisplayUser | undefined | null
}) => {
  const { payments, users, forUser } = props
  return (
    <Col className={'gap-2'}>
      {payments.map((payment) => {
        const fromUser = users?.find((u) => u.id === payment.fromId)
        const toUser = users?.find((u) => u.id === payment.toId)
        const decreasedBalance =
          (payment.fromId === forUser?.id) !== payment.amount < 0
        return (
          <Col key={payment.id} className="bg-canvas-0 w-full rounded-md p-2">
            <Row className={'justify-between'}>
              {fromUser && toUser ? (
                <Row className="gap-1">
                  <UserHovercard userId={fromUser.id}>
                    <Avatar
                      avatarUrl={fromUser.avatarUrl}
                      username={fromUser.username}
                    />
                  </UserHovercard>
                  <Col className={'w-full'}>
                    <Row className={'flex-wrap gap-x-1'}>
                      <span className={'ml-1'}>
                        <UserHovercard userId={fromUser.id}>
                          <UserLink user={fromUser} />
                        </UserHovercard>
                      </span>
                      <span>{payment.amount < 0 ? 'fined' : 'paid'}</span>
                      <span>
                        <UserHovercard userId={toUser.id}>
                          <UserLink user={toUser} />
                        </UserHovercard>
                      </span>
                    </Row>
                    <span className={'-mt-1'}>
                      <RelativeTimestamp
                        time={payment.createdTime}
                        shortened={true}
                        className={'text-sm'}
                      />
                    </span>
                  </Col>
                </Row>
              ) : (
                <span>Loading...</span>
              )}

              <span
                className={
                  payment.fromId === payment.toId
                    ? 'text-ink-500'
                    : decreasedBalance
                    ? 'text-scarlet-500'
                    : 'text-teal-500'
                }
              >
                {decreasedBalance ? '-' : '+'}
                {payment.token === 'M$'
                  ? formatMoney(Math.abs(payment.amount))
                  : formatSpice(Math.abs(payment.amount))}
              </span>
            </Row>
            <Row className={'ml-1 mt-2'}>
              <Linkify text={payment.data.message ?? ''} />
            </Row>
          </Col>
        )
      })}
    </Col>
  )
}

export const PaymentsModal = (props: {
  fromUser: User
  toUser?: DisplayUser
  show: boolean
  setShow: (show: boolean) => void
  defaultMessage?: string
  defaultAmount?: number
  groupId?: string
}) => {
  const {
    fromUser,
    groupId,
    defaultMessage = '',
    defaultAmount = 10,
    toUser,
    setShow,
    show,
  } = props
  const [amount, setAmount] = useState<number | undefined>(defaultAmount)
  const [message, setMessage] = useState(defaultMessage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSpice, setIsSpice] = useState(false)
  const [toUsers, setToUsers] = useState<DisplayUser[]>([])
  const [removedToUser, setRemovedToUser] = useState(false)
  const { canSend, message: cannotSendMessage } = useCanSendMana(fromUser)
  const isAdmin = isAdminId(fromUser.id)
  useEffect(() => {
    if (toUser) setToUsers([toUser])
  }, [toUser])

  const showSpice =
    fromUser.id === HOUSE_LIQUIDITY_PROVIDER_ID ||
    fromUser.id === DEV_HOUSE_LIQUIDITY_PROVIDER_ID ||
    (toUsers.length == 1 &&
      (toUsers[0].id === HOUSE_LIQUIDITY_PROVIDER_ID ||
        toUsers[0].id === DEV_HOUSE_LIQUIDITY_PROVIDER_ID))

  return (
    <Modal open={show} setOpen={setShow}>
      <Col className={'bg-canvas-0 rounded-md p-4'}>
        <div className="my-2 text-xl">Send mana</div>
        <Row className={'text-error'}>{!canSend ? cannotSendMessage : ''}</Row>
        <Col className={'gap-3'}>
          <Row className={'items-center justify-between'}>
            <Col>
              <div>To</div>
              {toUser && !removedToUser ? (
                <Col className={'mt-2'}>
                  <Row className={'items-center gap-1'}>
                    <UserAvatarAndBadge user={toUser} />
                    <XIcon
                      onClick={() => {
                        setToUsers([])
                        setRemovedToUser(true)
                      }}
                      className="text-ink-400 hover:text-ink-700 h-5 w-5 cursor-pointer rounded-full"
                      aria-hidden="true"
                    />
                  </Row>
                </Col>
              ) : (
                <SelectUsers
                  className={'w-64'}
                  setSelectedUsers={setToUsers}
                  selectedUsers={toUsers}
                  ignoreUserIds={[fromUser.id]}
                />
              )}
            </Col>
          </Row>
          <Row className={'items-center justify-between'}>
            {showSpice && (
              <Col>
                <span>Token</span>
                <ChoicesToggleGroup
                  currentChoice={isSpice ? 'PP' : 'M$'}
                  setChoice={(val) => setIsSpice(val === 'PP')}
                  choicesMap={{
                    Mana: 'M$',
                    'Prize Points': 'PP',
                  }}
                />
              </Col>
            )}
            <Col>
              <span>Amount</span>
              <AmountInput
                amount={amount}
                allowNegative={isAdmin}
                onChangeAmount={setAmount}
                label={
                  showSpice && isSpice
                    ? ENV_CONFIG.spiceMoniker
                    : ENV_CONFIG.moneyMoniker
                }
                inputClassName={'w-52'}
                onBlur={() => {
                  if (amount && amount < 10 && !isAdmin) {
                    setError('Amount must be 10 or more')
                  } else {
                    setError('')
                  }
                }}
              />
            </Col>
          </Row>
          <Row className={'items-center justify-between'}>
            <Col className={'w-full'}>
              <span>Message</span>
              <ExpandingInput
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={'w-full'}
              />
              {error && <span className={'text-error'}>{error}</span>}
            </Col>
          </Row>
          <Row className={'justify-end'}>
            <Button
              size={'lg'}
              onClick={async () => {
                if (!amount || !toUsers.length) return
                setLoading(true)
                try {
                  await api('managram', {
                    toIds: toUsers.map((user) => user.id),
                    amount,
                    message,
                    groupId,
                    token: showSpice && isSpice ? 'PP' : 'M$',
                  })
                  setError('')
                  setShow(false)
                } catch (e: any) {
                  setError(e.message)
                  console.error(e)
                }
                setLoading(false)
              }}
              disabled={
                loading ||
                !amount ||
                (amount < 10 && !isAdmin) ||
                !toUsers.length ||
                !canSend
              }
            >
              Send
            </Button>
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}

export const QRModal = (props: {
  show: boolean
  setShow: (show: boolean) => void
  user: DisplayUser
}) => {
  const { show, setShow, user } = props

  const [amount, setAmount] = useState<number | undefined>(10)
  const [message, setMessage] = useState('')

  const url =
    `https://${ENV_CONFIG.domain}/${user.username}?tab=payments&a=${
      amount ?? 10
    }` + (message && `&msg=${encodeURIComponent(message)}`)

  return (
    <Modal open={show} setOpen={setShow} className="bg-canvas-0 rounded-lg">
      <div className="flex flex-col items-center p-8">
        <div className="mb-4 text-2xl text-indigo-700">
          Scan to send mana to {user.name}
        </div>

        <CopyLinkRow
          url={url}
          eventTrackingName="copy managram page"
          linkBoxClassName="mb-4 w-full ellipsis"
        />
        <QRCode url={url} width={300} height={300} className="self-center" />

        <details className="flex flex-col self-stretch">
          <summary className="text-ink-700 mt-4">Advanced Options</summary>
          <span className="mt-2">Default Amount</span>
          <AmountInput
            amount={amount}
            onChangeAmount={setAmount}
            placeholder="10"
          />
          <span className="mt-2">Default Message</span>
          <ExpandingInput
            placeholder="What this transaction is for (e.g. tacos)"
            className="w-full"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </details>
      </div>
    </Modal>
  )
}
