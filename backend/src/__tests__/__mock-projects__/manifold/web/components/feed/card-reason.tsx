import clsx from 'clsx'
import { HiSparkles } from 'react-icons/hi'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import { UserLink } from 'web/components/widgets/user-link'
import { BiRepost } from 'react-icons/bi'
import { Tooltip } from 'web/components/widgets/tooltip'
import { FireIcon, UserIcon } from '@heroicons/react/outline'
import { UserHovercard } from '../user/user-hovercard'
import { FaGem } from 'react-icons/fa'
import { Repost } from 'common/repost'

export function CardReason(props: {
  reason: 'importance' | 'freshness' | 'conversion' | 'followed' | 'reposted'
  repost?: Repost
  probChange?: number
  since?: number
  className?: string
}) {
  const { reason, repost, probChange, since, className } = props

  if (probChange) {
    return <ProbabilityChange probChange={probChange} since={since} />
  } else if (reason === 'freshness') {
    return (
      <Row
        className={clsx('text-ink-400 items-center gap-1 text-sm', className)}
      >
        <HiSparkles className={'h-4 w-4 text-yellow-400'} />
        trending
      </Row>
    )
  } else if (reason === 'conversion') {
    return (
      <Row
        className={clsx('text-ink-400 items-center gap-1.5 text-sm', className)}
      >
        <FaGem className="h-3 w-3 text-blue-400" />
        interesting
      </Row>
    )
  } else if (reason === 'importance') {
    return (
      <span className={clsx('text-ink-400 text-sm', className)}>
        <Row className={'items-center gap-1'}>
          <FireIcon className="text-ink-400 h-4 w-4" />
          popular
        </Row>
      </span>
    )
  } else if (reason === 'followed') {
    return (
      <span className={clsx('text-ink-400 text-sm', className)}>
        <Row className={'items-center gap-1'}>
          <UserIcon className="text-ink-400 h-4 w-4" />
          following
        </Row>
      </span>
    )
  } else if (reason === 'reposted' && repost) {
    return (
      <Tooltip text={'Reposted by ' + repost.user_name}>
        <Row className={clsx('text-ink-400 gap-1 text-sm', className)}>
          <BiRepost className={'text-ink-400 h-5 w-5'} />
          <UserHovercard userId={repost.user_id}>
            <UserLink
              short={true}
              user={{
                id: repost.user_id,
                username: repost.user_username,
                name: repost.user_name,
              }}
            />
          </UserHovercard>
          reposted
          <RelativeTimestamp
            time={new Date(repost.created_time).valueOf()}
            shortened={true}
            className="text-ink-400 -ml-1"
          />
        </Row>
      </Tooltip>
    )
  }

  return null
}

function ProbabilityChange(props: { probChange: number; since?: number }) {
  const { probChange, since } = props
  const positiveChange = probChange && probChange > 0
  return (
    <span
      className={clsx(
        'text-ink-500 my-auto items-center gap-1 text-sm',
        positiveChange ? 'text-teal-600' : 'text-scarlet-600'
      )}
    >
      <span className="font-bold">
        {positiveChange ? '+' : ''}
        {probChange}%
      </span>{' '}
      {since
        ? shortenedFromNow(since) === '1d'
          ? 'today'
          : shortenedFromNow(since)
        : 'today'}
    </span>
  )
}
