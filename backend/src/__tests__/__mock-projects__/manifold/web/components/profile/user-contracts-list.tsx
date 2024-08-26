import clsx from 'clsx'
import { getUnresolvedContractsCount } from 'common/supabase/contracts'
import { User } from 'common/user'
import { shortFormatNumber } from 'common/util/format'
import { ReactNode, useEffect, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  getCreatorRank,
  getTotalPublicContractsCreated,
} from 'web/lib/supabase/users'
import { db } from 'web/lib/supabase/db'
import { SupabaseSearch } from 'web/components/supabase-search'
import { useUser } from 'web/hooks/use-user'
import { CreateQuestionButton } from '../buttons/create-question-button'
import { UserReviews } from '../reviews/user-reviews'
import { InfoTooltip } from '../widgets/info-tooltip'

export function UserContractsList(props: {
  creator: User
  rating?: number
  reviewCount?: number
  averageRating?: number
}) {
  const { creator, rating, reviewCount, averageRating } = props
  const { creatorTraders } = creator
  const { weekly, allTime } = creatorTraders
  const [marketsCreated, setMarketsCreated] = useState<number | undefined>()
  const [creatorRank, setCreatorRank] = useState<number | undefined>()
  const [unresolvedMarkets, setUnresolvedMarkets] = useState<number>(0)

  useEffect(() => {
    getTotalPublicContractsCreated(creator.id).then(setMarketsCreated)
    getCreatorRank(creator.id).then(setCreatorRank)
    getUnresolvedContractsCount(creator.id, db).then((count) =>
      setUnresolvedMarkets(count)
    )
  }, [creator.id, allTime])

  const user = useUser()
  // reset the key to force a re-render when the filter changes
  const [key, setKey] = useState(0)
  const [filter, setFilter] = useState<'all' | 'closed'>('all')
  const seeClosed = () => {
    setFilter('closed')
    setKey((k) => k + 1)
  }

  return (
    <Col className={'w-full'}>
      <Row className={'gap-8 pb-4'}>
        {rating && !!reviewCount && reviewCount > 0 && averageRating && (
          <Col>
            <Row className="text-ink-600 gap-0.5 text-xs sm:text-sm">
              Rating
              <InfoTooltip
                text={
                  'This average has been weighted to ensure more accurate representation'
                }
                size="sm"
              />
            </Row>
            <UserReviews
              userId={creator.id}
              rating={rating}
              averageRating={averageRating}
              reviewCount={reviewCount}
            />
          </Col>
        )}
        <MarketStats
          title={'Rank'}
          total={`#${shortFormatNumber(creatorRank ?? 0)}`}
        />
        <MarketStats
          title={'Questions'}
          total={shortFormatNumber(marketsCreated ?? 0)}
          subTitle={
            unresolvedMarkets === 0 ? null : (
              <Tooltip text={'Closed and waiting for resolution'}>
                <button
                  className="bg-scarlet-300 text-ink-0 min-w-[15px] cursor-pointer rounded-full p-[2px] text-center text-[10px] leading-3"
                  onClick={seeClosed}
                >
                  {`${unresolvedMarkets}`}
                </button>
              </Tooltip>
            )
          }
        />
        <MarketStats
          title={'Traders'}
          total={shortFormatNumber(allTime ?? 0)}
          subTitle={
            allTime === 0 ? (
              <></>
            ) : (
              <span
                className={clsx(
                  'text-sm',
                  weekly > 0 ? 'text-teal-500' : 'text-scarlet-500'
                )}
              >
                <Tooltip text={'7-day change'}>
                  {weekly > 0 ? '+' : ''}
                  {Math.round((weekly * 100) / allTime)}%
                </Tooltip>
              </span>
            )
          }
        />
      </Row>
      <SupabaseSearch
        key={key}
        defaultFilter={filter}
        defaultSort="newest"
        additionalFilter={{
          creatorId: creator.id,
        }}
        persistPrefix={`user-contracts-list-${creator.id}`}
        emptyState={
          <>
            <div className="text-ink-700 mx-2 mt-3 text-center">
              No questions found
            </div>
            {creator.id === user?.id && (
              <Row className={'mt-6 justify-center'}>
                <CreateQuestionButton className={'w-full max-w-[15rem]'} />
              </Row>
            )}
          </>
        }
        contractsOnly
      />
    </Col>
  )
}

export const MarketStats = (props: {
  title: string
  total: string
  subTitle?: ReactNode
}) => {
  const { title, total, subTitle } = props
  return (
    <Col className="select-none">
      <div className="text-ink-600 text-xs sm:text-sm">{title}</div>
      <Row className="items-center gap-2">
        <span className="text-primary-600 text-lg sm:text-xl">{total}</span>
        {subTitle}
      </Row>
    </Col>
  )
}
