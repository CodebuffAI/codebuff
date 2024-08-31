import dayjs from 'dayjs'
import { BETTOR } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'
import { formatMoney } from 'common/util/format'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { LiquidityProvision } from 'common/liquidity-provision'
import { UserLink } from 'web/components/widgets/user-link'
import { UserHovercard } from '../user/user-hovercard'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { DisplayUser } from 'common/api/user-types'

export function FeedLiquidity(props: {
  className?: string
  liquidity: LiquidityProvision
}) {
  const { liquidity } = props
  const { userId, createdTime } = liquidity

  const showUser = dayjs(createdTime).isAfter('2022-06-01')

  const bettor = useDisplayUserById(userId) ?? undefined

  const user = useUser()
  const isSelf = user?.id === userId

  return (
    <div className="to-primary-300 -ml-2 rounded-full bg-gradient-to-r from-pink-300 via-purple-300 p-2">
      <Row className="bg-ink-100 items-stretch gap-2 rounded-full">
        {isSelf ? (
          <Avatar avatarUrl={user.avatarUrl} username={user.username} />
        ) : showUser && bettor ? (
          <UserHovercard userId={userId}>
            <Avatar avatarUrl={bettor.avatarUrl} username={bettor.username} />
          </UserHovercard>
        ) : (
          <div className="relative px-1">
            <EmptyAvatar />
          </div>
        )}
        <LiquidityStatusText
          liquidity={liquidity}
          isSelf={isSelf}
          bettor={bettor}
        />
      </Row>
    </div>
  )
}

function LiquidityStatusText(props: {
  liquidity: LiquidityProvision
  isSelf: boolean
  bettor?: DisplayUser
}) {
  const { liquidity, bettor, isSelf } = props
  const { amount, createdTime } = liquidity

  const bought = amount >= 0 ? 'added' : 'withdrew'
  const money = formatMoney(Math.abs(amount))

  return (
    <div className="text-ink-1000 flex flex-wrap items-center gap-x-1 pr-4 text-sm">
      {bettor ? (
        <UserHovercard userId={bettor.id}>
          <UserLink user={bettor} />
        </UserHovercard>
      ) : (
        <span>{isSelf ? 'You' : `A ${BETTOR}`}</span>
      )}
      {bought} a subsidy of <span className="text-primary-700">{money}</span>
      <RelativeTimestamp time={createdTime} className="text-ink-1000" />
    </div>
  )
}
