import clsx from 'clsx'
import { keyBy, sortBy } from 'lodash'
import { useEffect, useState } from 'react'

import { Col } from '../layout/col'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { leagueActivity } from 'web/lib/api/api'
import { Contract } from 'common/contract'
import { FeedBet } from '../feed/feed-bets'
import { FeedComment } from '../comments/comment'
import { useIsAuthorized } from 'web/hooks/use-user'
import { ContractMention } from '../contract/contract-mention'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function LeagueFeed(props: { season: number; cohort: string }) {
  const { season, cohort } = props
  const { bets, comments, contracts, loading } = useLeagueFeed(season, cohort)

  const [maxItems, setMaxItems] = useState(100)

  const contractsById = keyBy(contracts, 'id')
  const items = sortBy([...bets, ...comments], 'createdTime')
    .reverse()
    .slice(0, maxItems)

  if (loading) return <LoadingIndicator />

  return (
    <Col>
      <Col className="bg-canvas-0 px-4">
        {items.map((item, i) => {
          const contract = contractsById[item.contractId]
          const prevItem = i > 0 ? items[i - 1] : null
          const prevContractTheSame = prevItem?.contractId === item.contractId

          return (
            <Col
              key={item.id}
              className={clsx('gap-2', prevContractTheSame ? 'pt-2' : 'pt-4')}
            >
              {!prevContractTheSame && <ContractMention contract={contract} />}
              {'amount' in item ? (
                <FeedBet
                  key={item.id}
                  bet={item as Bet}
                  contract={contract}
                  avatarSize="xs"
                />
              ) : (
                <FeedComment
                  key={item.id}
                  contract={contract}
                  comment={item}
                  trackingLocation={`league-S${season}-${cohort}`}
                />
              )}
            </Col>
          )
        })}

        <LoadMoreUntilNotVisible
          loadMore={async () => {
            setMaxItems((maxItems) => maxItems + 100)
            return maxItems < items.length
          }}
        />
      </Col>
    </Col>
  )
}

const useLeagueFeed = (season: number, cohort: string) => {
  const [data, setData] = useState<{
    bets: Bet[]
    comments: ContractComment[]
    contracts: Contract[]
  }>({ bets: [], comments: [], contracts: [] })
  const [loading, setLoading] = useState(true)

  const isAuthorized = useIsAuthorized()

  useEffect(() => {
    if (!isAuthorized) return

    setLoading(true)
    leagueActivity({ season, cohort }).then((data) => {
      setData(data)
      setLoading(false)
    })
  }, [isAuthorized, season, cohort])

  return { ...data, loading }
}
