import { BETTING_STREAK_BONUS_MAX } from 'common/economy'
import {
  getSourceUrl,
  LeagueChangeData,
  Notification,
  UniqueBettorData,
} from 'common/notification'
import {
  formatLargeNumber,
  formatMoney,
  formatMoneyToDecimal,
  maybePluralize,
} from 'common/util/format'
import { groupBy } from 'lodash'
import { useState } from 'react'
import clsx from 'clsx'

import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { BettingStreakModal } from '../profile/betting-streak-modal'
import { LoansModal } from '../profile/loans-modal'
import {
  AvatarNotificationIcon,
  NotificationFrame,
  NotificationIcon,
  NotificationUserLink,
  PrimaryNotificationLink,
  QuestionOrGroupLink,
} from './notification-helpers'
import { MultipleAvatarIcons } from './notification-types'
import { QuestRewardTxn } from 'common/txn'
import { QUEST_DETAILS } from 'common/quest'
import { QuestsModal } from '../home/quests-or-streak'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { BetOutcomeLabel } from 'web/components/outcome-label'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { DIVISION_NAMES } from 'common/leagues'
import { Linkify } from 'web/components/widgets/linkify'
import {
  PARTNER_UNIQUE_TRADER_BONUS,
  PARTNER_UNIQUE_TRADER_BONUS_MULTI,
  PARTNER_UNIQUE_TRADER_THRESHOLD,
} from 'common/partner'
import { isVerified } from 'common/user'
import { CoinNumber } from 'web/components/widgets/manaCoinNumber'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'
import { TRADE_TERM } from 'common/envs/constants'

// Loop through the contracts and combine the notification items into one
export function combineAndSumIncomeNotifications(
  notifications: Notification[]
) {
  const newNotifications: Notification[] = []
  const groupedNotificationsBySourceType = groupBy(
    notifications,
    (n) => n.sourceType
  )
  const titleForNotification = (notification: Notification) => {
    const outcomeType = notification.data?.outcomeType
    return (
      (notification.sourceTitle ?? notification.sourceContractTitle) +
      (outcomeType !== 'NUMBER' ? notification.data?.answerText ?? '' : '') +
      notification.data?.isPartner
    )
  }

  for (const sourceType in groupedNotificationsBySourceType) {
    // Source title splits by contracts, groups, betting streak bonus
    const groupedNotificationsBySourceTitle = groupBy(
      groupedNotificationsBySourceType[sourceType],
      (notification) => titleForNotification(notification)
    )
    for (const sourceTitle in groupedNotificationsBySourceTitle) {
      const notificationsForSourceTitle =
        groupedNotificationsBySourceTitle[sourceTitle]

      let sum = 0
      notificationsForSourceTitle.forEach((notification) => {
        sum += parseFloat(notification.sourceText ?? '0')
      })

      const { bet: _, ...otherData } =
        notificationsForSourceTitle[0]?.data ?? {}

      const newNotification = {
        ...notificationsForSourceTitle[0],
        sourceText: sum.toString(),
        sourceUserUsername: notificationsForSourceTitle[0].sourceUserUsername,
        data: {
          relatedNotifications: notificationsForSourceTitle,
          ...otherData,
        },
      }
      newNotifications.push(newNotification)
    }
  }
  return newNotifications
}

export function UniqueBettorBonusIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { sourceText } = notification
  const [open, setOpen] = useState(false)
  const data = (notification.data ?? {}) as UniqueBettorData
  const { outcomeType, isPartner, totalUniqueBettors } = data
  const relatedNotifications =
    data && 'relatedNotifications' in data
      ? (data as any).relatedNotifications
      : []
  const numNewTraders =
    relatedNotifications.length > 0 ? relatedNotifications.length : 1
  const answerText =
    relatedNotifications.length > 0
      ? relatedNotifications[0].data?.answerText
      : undefined

  const partnerBonusPerTrader =
    outcomeType === 'MULTIPLE_CHOICE'
      ? PARTNER_UNIQUE_TRADER_BONUS_MULTI
      : PARTNER_UNIQUE_TRADER_BONUS
  const partnerBonusAmount = numNewTraders * partnerBonusPerTrader
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <MultipleAvatarIcons
          notification={notification}
          symbol={'🎁'}
          setOpen={setOpen}
        />
      }
      subtitle={
        notification.data?.bet &&
        notification.data?.outcomeType && (
          <div className={'ml-0.5'}>
            <BettorStatusLabel uniqueBettorData={data} />
          </div>
        )
      }
      link={getSourceUrl(notification)}
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} /> Bonus for{' '}
        <PrimaryNotificationLink
          text={
            sourceText
              ? `${numNewTraders} ${maybePluralize(
                  'new trader',
                  numNewTraders
                )}`
              : 'new traders'
          }
        />{' '}
        on <QuestionOrGroupLink notification={notification} />{' '}
        {answerText && outcomeType !== 'NUMBER' ? ` (${answerText})` : ''}
      </span>
      {isPartner && totalUniqueBettors && (
        <div>
          Partners bonus:{' '}
          {totalUniqueBettors < PARTNER_UNIQUE_TRADER_THRESHOLD ? (
            <>
              only{' '}
              <span className="font-semibold">
                {PARTNER_UNIQUE_TRADER_THRESHOLD - totalUniqueBettors}
              </span>{' '}
              more traders to collect{' '}
              <span className="font-semibold text-teal-600">
                ${partnerBonusPerTrader.toFixed(2)} each
              </span>
            </>
          ) : (
            <span className="font-semibold text-teal-600">
              ${partnerBonusAmount.toFixed(2)}
            </span>
          )}
        </div>
      )}
      <MultiUserNotificationModal
        notification={notification}
        modalLabel={'Traders'}
        open={open}
        setOpen={setOpen}
      />
    </NotificationFrame>
  )
}
export function UniqueBettorNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const [open, setOpen] = useState(false)
  const data = (notification.data ?? {}) as UniqueBettorData
  const { outcomeType } = data
  const relatedNotifications =
    data && 'relatedNotifications' in data
      ? (data as any).relatedNotifications
      : []
  const numNewTraders =
    relatedNotifications.length > 0 ? relatedNotifications.length : 1
  const answerText =
    relatedNotifications.length > 0
      ? relatedNotifications[0].data?.answerText
      : undefined

  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <MultipleAvatarIcons
          notification={notification}
          symbol={'🆕'}
          setOpen={setOpen}
        />
      }
      subtitle={
        notification.data?.bet &&
        notification.data?.outcomeType && (
          <div className={'ml-0.5'}>
            <BettorStatusLabel uniqueBettorData={data} />
          </div>
        )
      }
      link={getSourceUrl(notification)}
    >
      <span className="line-clamp-3">
        <PrimaryNotificationLink
          text={`${numNewTraders} ${maybePluralize(
            'new trader',
            numNewTraders
          )}`}
        />{' '}
        on <QuestionOrGroupLink notification={notification} />{' '}
        {answerText && outcomeType !== 'NUMBER' ? ` (${answerText})` : ''}
      </span>
      <MultiUserNotificationModal
        notification={notification}
        modalLabel={'Traders'}
        open={open}
        setOpen={setOpen}
      />
    </NotificationFrame>
  )
}
export function PushNotificationBonusNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🎁'} />
      }
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} />{' '}
        <span className={'font-semibold'}>Bonus</span> for enabling push
        notifications
      </span>
    </NotificationFrame>
  )
}
export function QuestIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { data } = notification
  const { questType } = data as QuestRewardTxn['data']
  const user = useUser()
  const [open, setOpen] = useState(false)
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <NotificationIcon
          symbol={'🧭'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-primary-500 to-primary-300'
          }
        />
      }
      onClick={() => setOpen(true)}
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} /> Bonus for{' '}
        <PrimaryNotificationLink
          text={`completing the ${QUEST_DETAILS[questType].title} quest`}
        />
      </span>
      {user && <QuestsModal open={open} setOpen={setOpen} user={user} />}
    </NotificationFrame>
  )
}

export function BettingStreakBonusIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { sourceText } = notification
  const [open, setOpen] = useState(false)
  const user = useUser()
  const streakInDays = notification.data?.streak
  const noBonus = sourceText === '0'
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      subtitle={
        noBonus && user && !isVerified(user) ? (
          <span>
            Verify your phone number to get up to{' '}
            <CoinNumber
              amount={BETTING_STREAK_BONUS_MAX}
              className={'font-bold'}
              isInline
            />{' '}
            per streak day!
          </span>
        ) : (
          noBonus &&
          user &&
          isVerified(user) && (
            <span>Come back and predict again tomorrow for a bonus!</span>
          )
        )
      }
      icon={
        <NotificationIcon
          symbol={'🔥'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-primary-600 to-primary-300'
          }
        />
      }
      onClick={() => setOpen(true)}
    >
      {noBonus ? (
        <span className="line-clamp-3">
          Congrats on your {sourceText && <span>🔥 {streakInDays} day</span>}{' '}
          <PrimaryNotificationLink text="Prediction Streak" />
        </span>
      ) : (
        <span className="line-clamp-3">
          <IncomeNotificationLabel notification={notification} />{' '}
          {sourceText && +sourceText === BETTING_STREAK_BONUS_MAX && (
            <span>(max) </span>
          )}
          Bonus for your {sourceText && <span>🔥 {streakInDays} day</span>}{' '}
          <PrimaryNotificationLink text="Prediction Streak" />
        </span>
      )}
      <BettingStreakModal isOpen={open} setOpen={setOpen} currentUser={user} />
    </NotificationFrame>
  )
}
export function BettingStreakExpiringNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const [open, setOpen] = useState(false)
  const user = useUser()
  const streakInDays = notification.data?.streak
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <NotificationIcon
          symbol={'⏰'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-yellow-600 to-orange-300'
          }
        />
      }
      onClick={() => setOpen(true)}
      subtitle={'Place a prediction in the next 3 hours to keep it.'}
    >
      <span className="line-clamp-3">
        Don't let your <span>🔥 {streakInDays} day</span>{' '}
        <PrimaryNotificationLink text="Prediction Streak" /> expire!
      </span>
      <BettingStreakModal isOpen={open} setOpen={setOpen} currentUser={user} />
    </NotificationFrame>
  )
}

export function LoanIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const user = useUser()
  const [open, setOpen] = useState(false)
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <NotificationIcon
          symbol={'🏦'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-green-600 to-green-300'
          }
        />
      }
      onClick={() => setOpen(true)}
    >
      <span>
        <IncomeNotificationLabel notification={notification} /> of your invested
        predictions returned as a{' '}
        <span>
          <PrimaryNotificationLink text="Loan" />
        </span>
      </span>
      {user && open && (
        <LoansModal isOpen={open} setOpen={setOpen} user={user} />
      )}
    </NotificationFrame>
  )
}
export function ManaPaymentReceivedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { data, sourceId, sourceUserName, sourceUserUsername } = notification
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💸'} />
      }
      subtitle={<Linkify text={data?.message ?? ''} />}
      link={`/${sourceUserUsername}`}
    >
      <span>
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
          className=""
        />
        <PrimaryNotificationLink text=" sent you " />
        <IncomeNotificationLabel notification={notification} />
      </span>
    </NotificationFrame>
  )
}

export function UserJoinedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const {
    sourceId,
    sourceUserName,
    sourceUserUsername,
    sourceSlug,
    reason,
    sourceText,
  } = notification
  let reasonBlock = <span>because of a link you shared</span>
  if (sourceSlug && reason == 'user_joined_to_bet_on_your_market') {
    reasonBlock = (
      <>
        to {TRADE_TERM} on the question{' '}
        <QuestionOrGroupLink
          notification={notification}
          truncatedLength={'xl'}
        />
      </>
    )
  } else if (sourceSlug && reason === 'user_joined_from_your_group_invite') {
    reasonBlock = (
      <>
        because you shared{' '}
        <QuestionOrGroupLink
          notification={notification}
          truncatedLength={'xl'}
        />
      </>
    )
  }
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'👋'} />
      }
      link={getSourceUrl(notification)}
      subtitle={
        sourceText && (
          <span>
            As a thank you, we sent you{' '}
            <span className="text-teal-500">
              {formatMoney(parseInt(sourceText))}
            </span>
            !
          </span>
        )
      }
    >
      <div className="line-clamp-3">
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
        />{' '}
        joined Manifold {reasonBlock}
      </div>
    </NotificationFrame>
  )
}

export function LeagueChangedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { data } = notification
  const { previousLeague, newLeague, bonusAmount } = data as LeagueChangeData
  const newlyAdded = previousLeague === undefined
  const promoted =
    previousLeague && previousLeague.division < newLeague.division
  const demoted = previousLeague && previousLeague.division > newLeague.division
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <NotificationIcon
          symbol={newlyAdded ? '🏆' : promoted ? '🥇' : '🥈'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-primary-600 to-primary-300'
          }
        />
      }
      subtitle={
        bonusAmount > 0 ? (
          <span>
            You earned{' '}
            <PrizeIncomeNotificationLabel notification={notification} /> as a
            prize
            {previousLeague &&
              ` for placing Rank ${previousLeague.rank} this season`}
            .
          </span>
        ) : previousLeague ? (
          <span>You placed Rank {previousLeague.rank} this season.</span>
        ) : undefined
      }
      link={'/leagues'}
    >
      <div className="line-clamp-3">
        <span>
          {previousLeague && promoted
            ? `You've been promoted from ${
                DIVISION_NAMES[previousLeague.division]
              } to ${DIVISION_NAMES[newLeague.division]} league!`
            : previousLeague && demoted
            ? `You've been demoted from ${
                DIVISION_NAMES[previousLeague.division]
              } to ${DIVISION_NAMES[newLeague.division]} league.`
            : previousLeague
            ? `You retained your spot in ${
                DIVISION_NAMES[previousLeague.division]
              } league!`
            : `You were added to ${
                DIVISION_NAMES[newLeague.division]
              } league! Tap here to check it out.`}
        </span>
      </div>
    </NotificationFrame>
  )
}

function PrizeIncomeNotificationLabel(props: {
  notification: Notification
  className?: string
}) {
  const { notification, className } = props
  const { sourceText } = notification
  return sourceText ? (
    <span className={clsx('', className)}>
      <SpiceCoin className="mb-0.5" />
      {formatLargeNumber(parseFloat(sourceText))}
    </span>
  ) : (
    <div />
  )
}

function IncomeNotificationLabel(props: {
  notification: Notification
  className?: string
}) {
  const { notification, className } = props
  const { sourceText } = notification
  return sourceText ? (
    <span className={clsx('text-teal-600', className)}>
      {formatMoneyToDecimal(parseFloat(sourceText))}
    </span>
  ) : (
    <div />
  )
}

const BettorStatusLabel = (props: { uniqueBettorData: UniqueBettorData }) => {
  const { bet, outcomeType, answerText, totalAmountBet } =
    props.uniqueBettorData
  const { amount, outcome } = bet
  const showProb =
    (outcomeType === 'PSEUDO_NUMERIC' &&
      props.uniqueBettorData.max !== undefined) ||
    (outcomeType !== 'PSEUDO_NUMERIC' && outcomeType !== 'NUMBER')
  const showOutcome = outcomeType === 'MULTIPLE_CHOICE'
  return (
    <span className={'line-clamp-1 gap-1'}>
      <span className="text-ink-600">
        {formatMoney(totalAmountBet ?? amount)}
      </span>{' '}
      {showOutcome && `${outcome} `}
      on{' '}
      <BetOutcomeLabel
        bet={bet}
        contractOutcomeType={outcomeType}
        answerText={answerText}
      />{' '}
      {showProb &&
        `(${getFormattedMappedValue(
          props.uniqueBettorData as any,
          bet.probAfter
        )})`}
    </span>
  )
}

function MultiUserNotificationModal(props: {
  notification: Notification
  modalLabel: string
  open: boolean
  setOpen: (open: boolean) => void
  short?: boolean
}) {
  const { notification, modalLabel, open, setOpen, short } = props
  const relatedNotifications = notification.data?.relatedNotifications as
    | Notification[]
    | undefined

  return (
    <Modal open={open} setOpen={setOpen} size={'md'}>
      <Col className="bg-canvas-0 text-ink-1000 relative items-start gap-4 rounded-md p-6">
        <span className={'sticky top-0 text-xl'}>{modalLabel}</span>
        {(relatedNotifications?.length ?? 0) > 0 ? (
          <Col className="max-h-96 w-full gap-4 overflow-y-auto">
            {relatedNotifications?.map((notif) => (
              <Row
                key={notif.sourceUserUsername + 'list'}
                className="w-full items-center gap-1"
              >
                {notif.sourceText && (
                  <span className="min-w-[3.5rem] text-teal-500">
                    +{formatMoney(parseInt(notif.sourceText))}
                  </span>
                )}
                <Avatar
                  username={notif.sourceUserUsername}
                  avatarUrl={notif.sourceUserAvatarUrl}
                  size={'sm'}
                />
                <UserLink
                  user={{
                    id: notif.sourceId,
                    username: notif.sourceUserUsername,
                    name: notif.sourceUserName,
                  }}
                  short={short}
                />
                {notif.data?.bet && notif.data?.outcomeType && (
                  <BettorStatusLabel
                    uniqueBettorData={notif.data as UniqueBettorData}
                  />
                )}
              </Row>
            ))}
          </Col>
        ) : (
          <div>No one yet...</div>
        )}
      </Col>
    </Modal>
  )
}
