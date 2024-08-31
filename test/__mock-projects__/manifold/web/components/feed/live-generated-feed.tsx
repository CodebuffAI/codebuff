import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import Link from 'next/link'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import {
  FeedContractCard,
  LoadingCards,
} from 'web/components/contract/feed-contract-card'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { Fragment, useEffect, useState } from 'react'
import { APIResponse } from 'common/api/schema'
import { uniqBy } from 'lodash'
import { ScoredFeedRepost } from 'web/components/feed/scored-feed-repost-item'
import { useUser } from 'web/hooks/use-user'
import { Contract } from 'common/contract'
import { Repost } from 'common/repost'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { AD_PERIOD, AD_REDEEM_REWARD } from 'common/boost'

const defaultValue: APIResponse<'get-feed'> & { offset: number } = {
  contracts: [],
  comments: [],
  idsToReason: {},
  bets: [],
  reposts: [],
  ads: [],
  offset: 0,
}

export function LiveGeneratedFeed(props: {
  userId: string
  reload: boolean
  hidden?: boolean
}) {
  const { userId, reload, hidden } = props
  const user = useUser()

  const limit = 7
  const [feedData, setFeedData] = usePersistentInMemoryState(
    defaultValue,
    `feed-data-${userId}`
  )
  const ignoreContractIds = feedData.contracts.map((c) => c.id)
  const { data, error, refresh, setData } = useAPIGetter(
    'get-feed',
    {
      userId,
      offset: feedData.offset,
      limit,
      ignoreContractIds,
    },
    ['ignoreContractIds', 'offset']
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (reload) {
      setData(undefined)
      setFeedData(defaultValue)
      setLoading(true)
      setTimeout(async () => {
        refresh()
      }, 100)
    }
  }, [reload])

  if (error) {
    console.error(error.message)
  }

  useEffect(() => {
    if (!data) return
    setFeedData({
      contracts: uniqBy(feedData.contracts.concat(data.contracts), 'id'),
      comments: uniqBy(feedData.comments.concat(data.comments), 'id'),
      idsToReason: { ...feedData.idsToReason, ...data.idsToReason },
      bets: uniqBy(feedData.bets.concat(data.bets), 'id'),
      reposts: uniqBy(feedData.reposts.concat(data.reposts), 'id'),
      ads: uniqBy(feedData.ads.concat(data.ads), (a) => a.contract.id),
      offset: feedData.offset + limit,
    })
    setTimeout(() => {
      setLoading(false)
    }, 50)
  }, [data])
  const { contracts, reposts, ads, comments, bets, idsToReason } = feedData

  if (hidden) return null

  if (
    (data === undefined && contracts.length === 0) ||
    (contracts.length === 0 && loading)
  )
    return <LoadingCards />

  return (
    <Col className={clsx('relative w-full gap-4')}>
      {contracts.map((contract, i) => {
        const repost = reposts.find((r) => r.contract_id === contract.id)
        const comment = comments.find((c) => c.contractId === contract.id)
        const bet = bets.find((b) => b.contractId === contract.id)
        const adIndex = i / AD_PERIOD - 1
        const ad = ads[adIndex]
        return (
          <Fragment key={contract.id + comment?.id}>
            {i % AD_PERIOD === 0 && i !== 0 && ad && (
              <FeedCard
                contract={ad.contract}
                repost={undefined}
                comment={undefined}
                bet={undefined}
                user={user}
                reason={'ad'}
                adId={ad.adId}
              />
            )}
            <FeedCard
              contract={contract}
              repost={repost}
              comment={comment}
              bet={bet}
              user={user}
              reason={idsToReason[contract.id]}
            />
          </Fragment>
        )
      })}
      <div className="relative">
        {loading && <LoadingCards rows={1} />}
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) => {
            if (visible) {
              setLoading(true)
              refresh()
            }
          }}
        />
      </div>
      {contracts.length === 0 && !loading && (
        <div className="text-ink-1000 m-4 flex w-full flex-col items-center justify-center">
          <div>Congratulations!</div>
          <div>You've reached the end of the feed.</div>
          <div>You are free.</div>
          <br />
          <Link href="/home" className="text-primary-700 hover:underline">
            Browse new questions
          </Link>
          <Link href="/create" className="text-primary-700 hover:underline">
            Create a question
          </Link>
        </div>
      )}
    </Col>
  )
}

const FeedCard = (props: {
  contract: Contract
  repost: Repost | undefined
  comment: ContractComment | undefined
  bet: Bet | undefined
  user: User | undefined | null
  reason: string
  adId?: string
}) => {
  const { contract, adId, reason, user, repost, comment, bet } = props
  const [hidden, setHidden] = useState(false)
  return hidden ? (
    <Col
      className={clsx(
        'bg-canvas-0 border-canvas-0 rounded-xl border drop-shadow-md'
      )}
    >
      <Row className={'text-ink-400 mb-4 px-4 pt-3 text-sm'}>
        <i>Market hidden</i>
      </Row>
    </Col>
  ) : repost && comment ? (
    <ScoredFeedRepost
      contract={contract}
      comment={comment}
      repost={repost}
      trackingLocation={'feed'}
      bet={bet}
      user={user}
      hide={() => setHidden(true)}
    />
  ) : (
    <FeedContractCard
      trackingPostfix={'feed'}
      contract={contract}
      key={contract.id}
      hide={() => setHidden(true)}
      feedReason={reason}
      promotedData={adId ? { adId, reward: AD_REDEEM_REWARD } : undefined}
    />
  )
}
