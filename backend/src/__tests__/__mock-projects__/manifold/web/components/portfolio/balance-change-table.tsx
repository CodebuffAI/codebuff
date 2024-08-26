import { Col } from 'web/components/layout/col'
import { formatMoney, formatSpice, shortFormatNumber } from 'common/util/format'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { User } from 'common/user'
import { ReactNode, useState } from 'react'
import { DAY_MS } from 'common/util/time'
import {
  AnyBalanceChangeType,
  BetBalanceChange,
  TxnBalanceChange,
  isBetChange,
  isTxnChange,
} from 'common/balance-change'
import Link from 'next/link'
import { ENV_CONFIG } from 'common/envs/constants'
import {
  FaBackward,
  FaArrowRightArrowLeft,
  FaArrowTrendDown,
  FaArrowTrendUp,
} from 'react-icons/fa6'
import { contractPathWithoutContract } from 'common/contract'
import { linkClass } from 'web/components/widgets/site-link'
import { ScaleIcon } from '@heroicons/react/outline'
import { QuestType } from 'common/quest'
import { Input } from 'web/components/widgets/input'
import { formatJustTime, formatTimeShort } from 'web/lib/util/time'
import { assertUnreachable } from 'common/util/types'
import { AnyTxnCategory } from 'common/txn'

export const BalanceChangeTable = (props: {
  user: User
  balanceChanges: AnyBalanceChangeType[]
  simple?: boolean
}) => {
  const { user, simple } = props
  const [query, setQuery] = useState('')
  const balanceChanges = props.balanceChanges
    .filter((change) => {
      const { type } = change

      const contractQuestion =
        ('contract' in change && change.contract?.question) || ''
      const changeType = type
      const userName = 'user' in change ? change.user?.name ?? '' : ''
      const userUsername = 'user' in change ? change.user?.username ?? '' : ''
      const answerText = 'answer' in change ? change.answer?.text ?? '' : ''
      const betText = 'bet' in change ? betChangeToText(change) : ''
      return (
        contractQuestion.toLowerCase().includes(query.toLowerCase()) ||
        changeType.toLowerCase().includes(query.toLowerCase()) ||
        (txnTypeToDescription(changeType) || '')
          .toLowerCase()
          .includes(query.toLowerCase()) ||
        answerText.toLowerCase().includes(query.toLowerCase()) ||
        ((isTxnChange(change) && txnTitle(change)) || '')
          .toLowerCase()
          .includes(query.toLowerCase()) ||
        userName.toLowerCase().includes(query.toLowerCase()) ||
        userUsername.toLowerCase().includes(query.toLowerCase()) ||
        betText.toLowerCase().includes(query.toLowerCase())
      )
    })
    .slice(0, 1000)
  return (
    <Col className={' w-full justify-center'}>
      <Input
        type={'text'}
        placeholder={'Search your balance changes'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Col className={'gap-4 px-3 pt-4'}>
        <RenderBalanceChanges
          avatarSize={'md'}
          balanceChanges={balanceChanges}
          user={user}
          simple={simple}
          hideBalance={!!query}
        />
      </Col>
    </Col>
  )
}

function RenderBalanceChanges(props: {
  balanceChanges: AnyBalanceChangeType[]
  user: User
  avatarSize: 'sm' | 'md'
  simple?: boolean
  hideBalance?: boolean
}) {
  const { balanceChanges, user, avatarSize, simple, hideBalance } = props
  let currManaBalance = user.balance
  let currSpiceBalance = user.spiceBalance
  const balanceRunningTotals = [
    { mana: currManaBalance, spice: currSpiceBalance },
    ...balanceChanges.map((change) => {
      if (isTxnChange(change) && change.token === 'SPICE') {
        currSpiceBalance -= change.amount
      } else {
        currManaBalance -= change.amount
      }
      return { mana: currManaBalance, spice: currSpiceBalance }
    }),
  ]

  return (
    <>
      {balanceChanges.map((change, i) => {
        if (isBetChange(change)) {
          return (
            <BetBalanceChangeRow
              key={change.key}
              change={change}
              balance={balanceRunningTotals[i].mana}
              avatarSize={avatarSize}
              simple={simple}
              hideBalance={hideBalance}
            />
          )
        } else if (isTxnChange(change)) {
          return (
            <TxnBalanceChangeRow
              key={change.key}
              change={change as TxnBalanceChange}
              balance={balanceRunningTotals[i]}
              avatarSize={avatarSize}
              simple={simple}
              hideBalance={hideBalance}
            />
          )
        } else {
          assertUnreachable(change)
        }
      })}
    </>
  )
}

export function ChangeIcon(props: {
  slug: string | undefined
  symbol: string | ReactNode
  className: string
  avatarSize: 'sm' | 'md'
}) {
  const { symbol, slug, avatarSize, className } = props
  const image = (
    <>
      <div
        className={clsx(
          avatarSize === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
          'rounded-full',
          className
        )}
      />
      <div
        className="absolute  self-center text-lg"
        style={{
          top: '50%',
          right: '50%',
          transform: 'translate(50%, -50%)',
        }}
      >
        {symbol}
      </div>
    </>
  )

  return (
    <div className="relative">
      {slug ? (
        <Link href={slug} onClick={(e) => e.stopPropagation}>
          {image}
        </Link>
      ) : (
        image
      )}
    </div>
  )
}

const betChangeToText = (change: BetBalanceChange) => {
  const { type, bet } = change
  const { outcome } = bet
  return type === 'redeem_shares'
    ? `Redeem shares`
    : type === 'loan_payment'
    ? `Pay back loan`
    : type === 'fill_bet'
    ? `Fill ${outcome} order`
    : type === 'sell_shares'
    ? `Sell ${outcome} shares`
    : `Buy ${outcome}`
}
const BetBalanceChangeRow = (props: {
  change: BetBalanceChange
  balance: number
  avatarSize: 'sm' | 'md'
  simple?: boolean
  hideBalance?: boolean
}) => {
  const { change, balance, avatarSize, simple, hideBalance } = props
  const { amount, contract, answer, bet, type } = change
  const { outcome } = bet
  const { slug, question, creatorUsername } = contract
  const niceAmount =
    ENV_CONFIG.moneyMoniker + shortFormatNumber(amount).replace('-', '')
  const direction =
    type === 'redeem_shares'
      ? 'sideways'
      : type === 'sell_shares' && outcome === 'YES'
      ? 'down'
      : type === 'sell_shares' && outcome === 'NO'
      ? 'up'
      : outcome === 'YES'
      ? 'up'
      : 'down'
  return (
    <Row className={'gap-2'}>
      <Col className={'mt-0.5'}>
        <ChangeIcon
          avatarSize={avatarSize}
          slug={
            slug
              ? contractPathWithoutContract(creatorUsername, slug)
              : undefined
          }
          symbol={
            type === 'loan_payment' ? (
              '🏦'
            ) : (
              <div>
                {direction === 'up' ? (
                  <FaArrowTrendUp className={'h-5 w-5 '} />
                ) : direction === 'down' ? (
                  <FaArrowTrendDown className={'h-5 w-5'} />
                ) : (
                  <FaArrowRightArrowLeft className={'h-4 w-4'} />
                )}
              </div>
            )
          }
          className={
            direction === 'up'
              ? 'bg-teal-500'
              : direction === 'down'
              ? 'bg-scarlet-400'
              : 'bg-blue-400'
          }
        />
      </Col>
      <Col className={'w-full overflow-x-hidden'}>
        <Row className={'justify-between gap-2'}>
          {slug ? (
            <Link
              href={contractPathWithoutContract(creatorUsername, slug)}
              className={clsx('line-clamp-2', linkClass)}
            >
              {question}
            </Link>
          ) : (
            <div className={clsx('line-clamp-2')}>{question}</div>
          )}
          <span
            className={clsx(
              'inline-flex whitespace-nowrap',
              amount > 0 ? 'text-teal-700' : 'text-ink-600'
            )}
          >
            {amount > 0 ? '+' : '-'}
            {niceAmount}
          </span>
        </Row>
        <Row>
          <div className={clsx('text-ink-600 line-clamp-1')}>
            {betChangeToText(change)} {answer ? ` on ${answer.text}` : ''}
          </div>
        </Row>
        {!simple && (
          <Row className={'text-ink-600'}>
            {!hideBalance && (
              <>
                {formatMoney(balance)} {'·'}
              </>
            )}{' '}
            {customFormatTime(change.createdTime)}
          </Row>
        )}
      </Col>
    </Row>
  )
}

const customFormatTime = (time: number) => {
  if (time > Date.now() - DAY_MS) {
    return formatJustTime(time)
  }
  return formatTimeShort(time)
}

const TxnBalanceChangeRow = (props: {
  change: TxnBalanceChange
  balance: { mana: number; spice: number }
  avatarSize: 'sm' | 'md'
  simple?: boolean
  hideBalance?: boolean
}) => {
  const { change, balance, avatarSize, simple, hideBalance } = props
  const { contract, amount, type, token, user, charity, description } = change

  const reasonToBgClassNameMap: Partial<{
    [key in AnyTxnCategory]: string
  }> = {
    QUEST_REWARD: 'bg-amber-400',
    BETTING_STREAK_BONUS: 'bg-red-400',
    CREATE_CONTRACT_ANTE: 'bg-indigo-400',
    CONTRACT_RESOLUTION_PAYOUT: 'bg-yellow-200',
    CONTRACT_UNDO_RESOLUTION_PAYOUT: 'bg-ink-1000',
    PRODUCE_SPICE: 'bg-yellow-200',
    CONTRACT_UNDO_PRODUCE_SPICE: 'bg-ink-1000',
    CONSUME_SPICE: 'bg-indigo-400',
    CONSUME_SPICE_DONE: 'bg-indigo-400',
    SIGNUP_BONUS: 'bg-yellow-200',
    MANA_PURCHASE: 'bg-gradient-to-br from-blue-400 via-green-100 to-green-300',
    MARKET_BOOST_REDEEM: 'bg-purple-200',
    MARKET_BOOST_CREATE: 'bg-purple-400',
    LEAGUE_PRIZE: 'bg-indigo-400',
    BOUNTY_POSTED: 'bg-indigo-400',
    BOUNTY_AWARDED: 'bg-teal-600',
    MANA_PAYMENT: 'bg-teal-400',
    LOAN: 'bg-amber-500',
    ADD_SUBSIDY: 'bg-red-100',
    UNIQUE_BETTOR_BONUS: 'bg-sky-400',
    CHARITY: 'bg-gradient-to-br from-pink-300 via-purple-300 to-primary-400',
  }

  return (
    <Row className={'gap-2'}>
      <Col className={'mt-0.5'}>
        <ChangeIcon
          avatarSize={avatarSize}
          slug={
            contract?.slug
              ? contractPathWithoutContract(
                  contract.creatorUsername,
                  contract.slug
                )
              : user?.username
          }
          symbol={
            type === 'MANA_PAYMENT' ? (
              '💸'
            ) : type === 'MARKET_BOOST_CREATE' ? (
              '🚀'
            ) : type === 'ADD_SUBSIDY' ? (
              '💧'
            ) : type === 'CONTRACT_RESOLUTION_PAYOUT' ||
              type === 'PRODUCE_SPICE' ? (
              '🎉'
            ) : type === 'CONTRACT_UNDO_RESOLUTION_PAYOUT' ||
              type === 'CONTRACT_UNDO_PRODUCE_SPICE' ? (
              <FaBackward className={'h-5 w-5 text-white'} />
            ) : type === 'CREATE_CONTRACT_ANTE' || type === 'BOUNTY_POSTED' ? (
              <ScaleIcon className={'-ml-[1px] mb-1 h-5 w-5'} />
            ) : type === 'CONSUME_SPICE' || type === 'CONSUME_SPICE_DONE' ? (
              <FaArrowRightArrowLeft className={'h-4 w-4'} />
            ) : type === 'CHARITY' ? (
              '❤️'
            ) : type === 'LOAN' ? (
              '🏦'
            ) : type === 'MANA_PURCHASE' ? (
              '🤑'
            ) : [
                'UNIQUE_BETTOR_BONUS',
                'BETTING_STREAK_BONUS',
                'SIGNUP_BONUS',
                'QUEST_REWARD',
                'MARKET_BOOST_REDEEM',
                'LEAGUE_PRIZE',
                'BOUNTY_AWARDED',
              ].includes(type) ? (
              '🎁'
            ) : (
              ''
            )
          }
          className={reasonToBgClassNameMap[type] ?? 'bg-canvas-100'}
        />
      </Col>
      <Col className={'w-full'}>
        <Row className={'justify-between'}>
          {contract && contract.slug ? (
            <Link
              href={contractPathWithoutContract(
                contract.creatorUsername,
                contract.slug
              )}
              className={clsx('line-clamp-2', linkClass)}
            >
              {txnTitle(change)}
            </Link>
          ) : user ? (
            <Link
              href={'/' + user.username}
              className={clsx('line-clamp-2', linkClass)}
            >
              {txnTitle(change)}
            </Link>
          ) : charity ? (
            <Link
              href={`/charity/${charity.slug}`}
              className={clsx('line-clamp-2', linkClass)}
            >
              {txnTitle(change)}
            </Link>
          ) : (
            <div className={clsx('line-clamp-2')}>{txnTitle(change)}</div>
          )}

          <span
            className={clsx(
              'shrink-0',
              amount > 0 ? 'text-teal-700' : 'text-ink-600'
            )}
          >
            {amount > 0 ? '+' : '-'}
            {token === 'SPICE'
              ? formatSpice(amount).replace('-', '')
              : formatMoney(amount).replace('-', '')}
          </span>
        </Row>
        <div className={'text-ink-600'}>
          {txnTypeToDescription(type) ?? description ?? type}
        </div>
        {!simple && (
          <Row className={'text-ink-600'}>
            {!hideBalance && (
              <>
                {token === 'SPICE'
                  ? formatSpice(balance.spice)
                  : formatMoney(balance.mana)}
                {' · '}
              </>
            )}
            {customFormatTime(change.createdTime)}
          </Row>
        )}
      </Col>
    </Row>
  )
}

const txnTitle = (change: TxnBalanceChange) => {
  const { type, contract, user, questType, charity } = change

  if (user) {
    return user.username
  }
  if (charity) {
    return charity.name
  }
  if (contract) {
    return contract.question
  }

  switch (type) {
    case 'QUEST_REWARD':
      return questType ? questTypeToDescription(questType) : ''
    case 'BETTING_STREAK_BONUS':
      return 'Prediction streak bonus' // usually the question instead
    case 'LOAN':
      return 'Loan'
    case 'LEAGUE_PRIZE':
      return 'League prize'
    case 'MANA_PURCHASE':
      return 'Mana purchase'
    case 'MARKET_BOOST_REDEEM':
      return 'Claim boost'
    case 'SIGNUP_BONUS':
      return change.description ?? 'Signup bonus'
    case 'CONSUME_SPICE':
    case 'CONSUME_SPICE_DONE':
      return `Redeem prize points for mana`
    default:
      return type
  }
}

const txnTypeToDescription = (txnCategory: string) => {
  switch (txnCategory) {
    case 'MARKET_BOOST_CREATE':
      return 'Boost'
    case 'PRODUCE_SPICE':
    case 'CONTRACT_RESOLUTION_PAYOUT':
      return 'Payout'
    case 'CREATE_CONTRACT_ANTE':
      return 'Ante'
    case 'UNIQUE_BETTOR_BONUS':
      return 'Trader bonus'
    case 'BETTING_STREAK_BONUS':
      return 'Quests'
    case 'SIGNUP_BONUS':
      return 'New user bonuses'
    case 'QUEST_REWARD':
      return 'Quests'
    case 'CONTRACT_UNDO_PRODUCE_SPICE':
    case 'CONTRACT_UNDO_RESOLUTION_PAYOUT':
      return 'Unresolve'
    case 'CONSUME_SPICE':
    case 'CONSUME_SPICE_DONE':
      return ''
    case 'MANA_PURCHASE':
      return ''
    case 'ADD_SUBSIDY':
      return 'Subsidy'
    case 'MARKET_BOOST_REDEEM':
      return 'Leagues'
    case 'BOUNTY_POSTED':
      return 'Ante'
    case 'BOUNTY_AWARDED':
      return 'Bounty awarded'
    case 'MANA_PAYMENT':
      return 'User payment'
    case 'CHARITY':
      return 'Donation'
    case 'LOAN':
      return ''
    default:
      return null
  }
}

const questTypeToDescription = (questType: QuestType) => {
  switch (questType) {
    case 'SHARES':
      return 'Sharing bonus'
    case 'MARKETS_CREATED':
      return 'Creation bonus'
    case 'REFERRALS':
      return 'Referral bonus'
    default:
      return 'questType'
  }
}
