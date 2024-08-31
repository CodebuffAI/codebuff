import clsx from 'clsx'

import { User } from 'common/user'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsAuthorized, usePrivateUser, useUser } from 'web/hooks/use-user'
import { LoadingContractRow } from '../contract/contracts-table'
import { Col } from '../layout/col'
import { SupabaseSearch } from '../supabase-search'
import { PortfolioValueSection } from './portfolio-value-section'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { TwombaPortfolioValueSection } from './twomba-portfolio-value-section'

export const PortfolioSummary = (props: { user: User; className?: string }) => {
  const { user, className } = props
  const currentUser = useUser()
  const privateUser = usePrivateUser()
  const isAuthed = useIsAuthorized()
  const isCurrentUser = currentUser?.id === user.id
  const isCreatedInLastWeek =
    user.createdTime > Date.now() - 7 * 24 * 60 * 60 * 1000

  const { data: portfolioData } = useAPIGetter('get-user-portfolio', {
    userId: user.id,
  })

  return (
    <Col className={clsx(className, 'gap-4')}>
      {TWOMBA_ENABLED ? (
        <TwombaPortfolioValueSection
          user={user}
          defaultTimePeriod={
            isCreatedInLastWeek
              ? 'allTime'
              : currentUser?.id === user.id
              ? 'weekly'
              : 'monthly'
          }
          portfolio={portfolioData}
        />
      ) : (
        <PortfolioValueSection
          user={user}
          defaultTimePeriod={
            isCreatedInLastWeek
              ? 'allTime'
              : currentUser?.id === user.id
              ? 'weekly'
              : 'monthly'
          }
          portfolio={portfolioData}
        />
      )}

      {isCurrentUser && (
        <Col className={clsx('border-ink-300 mb-6 mt-2 gap-2 border-t')}>
          <div className="text-ink-800 mx-2 pt-4 text-xl font-semibold lg:mx-0">
            Recently viewed
          </div>
          {!isAuthed && (
            <Col>
              <LoadingContractRow />
              <LoadingContractRow />
              <LoadingContractRow />
            </Col>
          )}
          {isAuthed && (
            <SupabaseSearch
              persistPrefix="recent"
              additionalFilter={{
                excludeContractIds: privateUser?.blockedContractIds,
                excludeGroupSlugs: privateUser?.blockedGroupSlugs,
                excludeUserIds: privateUser?.blockedUserIds,
              }}
              useUrlParams={false}
              isWholePage={false}
              headerClassName={'!hidden'}
              topicSlug="recent"
              contractsOnly
              hideContractFilters
              hideSearch
            />
          )}
        </Col>
      )}
    </Col>
  )
}
