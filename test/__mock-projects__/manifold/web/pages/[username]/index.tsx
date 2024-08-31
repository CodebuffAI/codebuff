import {
  CashIcon,
  ChatAlt2Icon,
  ScaleIcon,
  PresentationChartLineIcon,
  ChevronDownIcon,
  ViewListIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { DIVISION_NAMES, getLeaguePath } from 'common/leagues'
import { removeUndefinedProps } from 'common/util/object'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'

import { SEO } from 'web/components/SEO'
import { ENV_CONFIG, TWOMBA_ENABLED } from 'common/envs/constants'
import { referralQuery } from 'common/util/share'
import { UserBetsTable } from 'web/components/bet/user-bets-table'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { FollowButton } from 'web/components/buttons/follow-button'
import { MoreOptionsUserButton } from 'web/components/buttons/more-options-user-button'
import { TextButton } from 'web/components/buttons/text-button'
import { UserCommentsList } from 'web/components/comments/profile-comments'
import { FollowList } from 'web/components/follow-list'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { QueryUncontrolledTabs, Tabs } from 'web/components/layout/tabs'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { BlockedUser } from 'web/components/profile/blocked-user'
import { UserContractsList } from 'web/components/profile/user-contracts-list'
import { UserLikedContractsButton } from 'web/components/profile/user-liked-contracts-button'
import { Avatar } from 'web/components/widgets/avatar'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import ImageWithBlurredShadow from 'web/components/widgets/image-with-blurred-shadow'
import { Linkify } from 'web/components/widgets/linkify'
import { linkClass } from 'web/components/widgets/site-link'
import { Title } from 'web/components/widgets/title'
import { StackedUserNames, UserLink } from 'web/components/widgets/user-link'
import { useAdmin } from 'web/hooks/use-admin'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { usePrivateUser, useUser, useWebsocketUser } from 'web/hooks/use-user'
import { User } from 'web/lib/firebase/users'
import TrophyIcon from 'web/lib/icons/trophy-icon.svg'
import { db } from 'web/lib/supabase/db'
import { getAverageUserRating, getUserRating } from 'web/lib/supabase/reviews'
import Custom404 from 'web/pages/404'
import { UserPayments } from 'web/pages/payments'
import { UserHandles } from 'web/components/user/user-handles'
import { BackButton } from 'web/components/contract/back-button'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { isUserLikelySpammer } from 'common/user'
import { PortfolioSummary } from 'web/components/portfolio/portfolio-summary'
import { isBetChange } from 'common/balance-change'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { buildArray } from 'common/util/array'
import { ManaCircleIcon } from 'web/components/icons/mana-circle-icon'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { PortfolioValueSection } from 'web/components/portfolio/portfolio-value-section'
import { VerifyPhoneNumberBanner } from 'web/components/user/verify-phone-number-banner'
import { FaCrown } from 'react-icons/fa6'
import { getUserForStaticProps } from 'common/supabase/users'
import { VerifyMe } from 'web/components/gidx/verify-me'
import { BalanceChangeTable } from 'web/components/portfolio/balance-change-table'
import { TwombaPortfolioValueSection } from 'web/components/portfolio/twomba-portfolio-value-section'
import { unauthedApi } from 'common/util/api'
import { AddFundsButton } from 'web/components/profile/add-funds-button'
import { RedeemSpiceButton } from 'web/components/profile/redeem-spice-button'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params

  const user = await getUserForStaticProps(db, username)
  const { data } = user
    ? await db.from('contracts').select('id').eq('creator_id', user.id).limit(1)
    : { data: null }
  const hasCreatedQuestion = data?.length
  const { count, rating } = (user ? await getUserRating(user.id) : null) ?? {}
  const averageRating = user ? await getAverageUserRating(user.id) : undefined
  const shouldIgnoreUser = user ? await shouldIgnoreUserPage(user) : false

  return {
    props: removeUndefinedProps({
      user,
      username,
      rating: rating,
      reviewCount: count,
      averageRating: averageRating,
      shouldIgnoreUser,
      hasCreatedQuestion,
    }),
    revalidate: 60,
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPage(props: {
  user: User | null
  username: string
  rating?: number
  reviewCount?: number
  averageRating?: number
  shouldIgnoreUser: boolean
  hasCreatedQuestion: boolean
}) {
  const isAdmin = useAdmin()
  const { user, ...profileProps } = props
  const privateUser = usePrivateUser()
  const blockedByCurrentUser =
    privateUser?.blockedUserIds.includes(user?.id ?? '_') ?? false
  if (!user) return <Custom404 />
  else if (user.userDeleted && !isAdmin) return <DeletedUser />

  return privateUser && blockedByCurrentUser ? (
    <BlockedUser user={user} privateUser={privateUser} />
  ) : (
    <UserProfile user={user} {...profileProps} />
  )
}

const shouldIgnoreUserPage = async (user: User) => {
  // lastBetTime isn't always reliable, so use the contract_bets table to be sure
  const bet = await unauthedApi('bets', { userId: user.id, limit: 1 })
  return (
    user.userDeleted ||
    user.isBannedFromPosting ||
    isUserLikelySpammer(user, bet.length > 0)
  )
}

export const DeletedUser = () => {
  return (
    <Page trackPageView={'deleted user profile'}>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="flex h-full flex-col items-center justify-center">
        <Title>Deleted account</Title>
        <p>This user's account has been deleted.</p>
      </div>
    </Page>
  )
}

function UserProfile(props: {
  user: User
  rating?: number
  reviewCount?: number
  averageRating?: number
  shouldIgnoreUser: boolean
  hasCreatedQuestion: boolean
}) {
  const {
    rating,
    hasCreatedQuestion,
    shouldIgnoreUser,
    reviewCount,
    averageRating,
  } = props
  const user = useWebsocketUser(props.user.id) ?? props.user
  const isMobile = useIsMobile()
  const router = useRouter()
  const currentUser = useUser()

  useSaveReferral(currentUser, {
    defaultReferrerUsername: user?.username,
  })
  const isCurrentUser = user.id === currentUser?.id
  const [expandProfileInfo, setExpandProfileInfo] = usePersistentLocalState(
    false,
    'expand-profile-info'
  )
  const [showConfetti, setShowConfetti] = useState(false)
  const [followsYou, setFollowsYou] = useState(false)
  const { ref: titleRef, headerStuck } = useHeaderIsStuck()

  useEffect(() => {
    const claimedMana = router.query['claimed-mana'] === 'yes'
    setShowConfetti(claimedMana)
    const query = { ...router.query }
    if (query.claimedMana || query.show) {
      const queriesToDelete = ['claimed-mana', 'show', 'badge']
      queriesToDelete.forEach((key) => delete query[key])
      router.replace(
        {
          pathname: router.pathname,
          query,
        },
        undefined,
        { shallow: true }
      )
    }
  }, [])

  useEffect(() => {
    if (currentUser && currentUser.id !== user.id) {
      db.from('user_follows')
        .select('user_id')
        .eq('follow_id', currentUser.id)
        .eq('user_id', user.id)
        .then(({ data }) => {
          setFollowsYou(
            data?.some(({ user_id }) => user_id === user.id) ?? false
          )
        })
    }
  }, [currentUser?.id, user?.id])

  const { data: newBalanceChanges } = useAPIGetter('get-balance-changes', {
    userId: user.id,
    after: dayjs().startOf('day').subtract(14, 'day').valueOf(),
  })

  const balanceChanges = newBalanceChanges ?? []
  const hasBetBalanceChanges = balanceChanges.some((b) => isBetChange(b))
  const balanceChangesKey = 'balance-changes'

  return (
    <Page
      key={user.id}
      trackPageView={'user page'}
      trackPageProps={{ username: user.username }}
      className={clsx(isCurrentUser ? 'lg:!mt-0' : 'lg:mt-4')}
    >
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />
      {shouldIgnoreUser && (
        <Head>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}
      {showConfetti && <FullscreenConfetti />}

      <Col className="relative">
        <Row
          className={
            'bg-canvas-50 sticky top-0 z-10 h-12 w-full justify-between gap-1 sm:static sm:h-auto'
          }
        >
          {isMobile && (
            <>
              <BackButton className="px-6" />

              <div
                className={clsx(
                  'self-center opacity-0 transition-opacity first:ml-4',
                  headerStuck && 'opacity-100'
                )}
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <UserLink user={user} noLink />
              </div>

              <MoreOptionsUserButton user={user} />
            </>
          )}
        </Row>

        <Row
          className={clsx('mx-4 flex-wrap justify-between gap-2 py-1')}
          ref={titleRef}
        >
          {isCurrentUser ? (
            <button
              className="group flex gap-2 py-1 pr-2"
              onClick={() => isCurrentUser && setExpandProfileInfo((v) => !v)}
            >
              <Col className={'relative max-h-14'}>
                <ImageWithBlurredShadow
                  image={
                    <Avatar
                      username={user.username}
                      avatarUrl={user.avatarUrl}
                      size={'lg'}
                      className="bg-ink-1000"
                      noLink
                    />
                  }
                />

                <ChevronDownIcon
                  className={clsx(
                    'group-hover:bg-primary-700 bg-primary-600 shadow-primary-300 text-ink-0 absolute bottom-0 right-0 h-5 w-5 rounded-full p-0.5 shadow-sm transition-all',
                    expandProfileInfo ? 'rotate-180' : 'rotate-0'
                  )}
                />
              </Col>
              <StackedUserNames
                usernameClassName={'sm:text-base'}
                className={'font-bold sm:mr-0 sm:text-xl'}
                user={user}
                followsYou={followsYou}
              />
            </button>
          ) : (
            <Row className="gap-2 py-1">
              <ImageWithBlurredShadow
                image={
                  <Avatar
                    username={user.username}
                    avatarUrl={user.avatarUrl}
                    size={'lg'}
                    className="bg-ink-1000"
                    noLink
                  />
                }
              />
              <StackedUserNames
                usernameClassName={'sm:text-base'}
                className={'font-bold sm:mr-0 sm:text-xl'}
                user={user}
                followsYou={followsYou}
              />
            </Row>
          )}

          <Row className={'items-center gap-1 sm:gap-2'}>
            {!isCurrentUser && (
              <>
                <SendMessageButton toUser={user} currentUser={currentUser} />
                <FollowButton userId={user.id} />
              </>
            )}

            {!isMobile && <MoreOptionsUserButton user={user} />}
          </Row>
        </Row>
        {(expandProfileInfo || !isCurrentUser) && (
          <Col className={'mx-4 mt-1 gap-2'}>
            <ProfilePublicStats user={user} currentUser={currentUser} />
            {user.bio && (
              <div className="sm:text-md mt-1 text-sm">
                <Linkify text={user.bio}></Linkify>
              </div>
            )}
            <UserHandles
              website={user.website}
              twitterHandle={user.twitterHandle}
              discordHandle={user.discordHandle}
              className="mt-2"
            />
          </Col>
        )}

        {isCurrentUser && TWOMBA_ENABLED && (
          <Row className="my-2 w-full items-center gap-2 px-4">
            <AddFundsButton userId={user.id} className="whitespace-nowrap" />
            <RedeemSpiceButton
              userId={user.id}
              className="whitespace-nowrap"
              spice={user.spiceBalance}
            />
          </Row>
        )}

        <Col className="mx-4">
          <QueryUncontrolledTabs
            trackingName={'profile tabs'}
            labelsParentClassName={'gap-0 sm:gap-4'}
            labelClassName={'pb-2 pt-2'}
            saveTabInLocalStorageKey={
              isCurrentUser ? `profile-tabs-${user.id}` : undefined
            }
            tabs={buildArray(
              isCurrentUser && {
                title: 'Summary',
                prerender: true,
                stackedTabIcon: <PresentationChartLineIcon className="h-5" />,
                content: (
                  <>
                    {currentUser && <VerifyMe user={currentUser} />}
                    <VerifyPhoneNumberBanner user={currentUser} />
                    <PortfolioSummary className="mt-4" user={user} />
                  </>
                ),
              },
              (!!user.lastBetTime || hasBetBalanceChanges) && {
                title: 'Trades',
                prerender: true,
                stackedTabIcon: <ManaCircleIcon className="h-5 w-5" />,
                content: (
                  <>
                    <Spacer h={2} />
                    {!isCurrentUser && (
                      <>
                        {TWOMBA_ENABLED ? (
                          <>
                            <TwombaPortfolioValueSection
                              user={user}
                              defaultTimePeriod={
                                currentUser?.id === user.id
                                  ? 'weekly'
                                  : 'monthly'
                              }
                              hideAddFundsButton
                            />

                            <div className="text-ink-800 border-ink-300 mx-2 mt-6 gap-2 border-t pt-4 text-xl font-semibold lg:mx-0">
                              Trades
                            </div>
                          </>
                        ) : (
                          <PortfolioValueSection
                            user={user}
                            defaultTimePeriod={
                              currentUser?.id === user.id ? 'weekly' : 'monthly'
                            }
                            hideAddFundsButton
                          />
                        )}
                        <Spacer h={4} />
                      </>
                    )}
                    <UserBetsTable user={user} />
                  </>
                ),
              },
              hasCreatedQuestion && {
                title: 'Questions',
                prerender: true,
                stackedTabIcon: <ScaleIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <UserContractsList
                      creator={user}
                      rating={rating}
                      reviewCount={reviewCount}
                      averageRating={averageRating}
                    />
                  </>
                ),
              },
              {
                title: 'Comments',
                stackedTabIcon: <ChatAlt2Icon className="h-5" />,
                content: (
                  <Col>
                    <UserCommentsList user={user} />
                  </Col>
                ),
              },
              {
                title: 'Balance log',
                stackedTabIcon: <ViewListIcon className="h-5" />,
                content: (
                  <BalanceChangeTable
                    user={user}
                    balanceChanges={balanceChanges}
                  />
                ),
                queryString: balanceChangesKey,
              },
              {
                title: 'Payments',
                stackedTabIcon: <CashIcon className="h-5" />,
                content: (
                  <>
                    <Spacer h={4} />
                    <UserPayments userId={user.id} />
                  </>
                ),
              }
            )}
          />
        </Col>
      </Col>
    </Page>
  )
}

type FollowsDialogTab = 'following' | 'followers'

function ProfilePublicStats(props: {
  user: User
  currentUser: User | undefined | null
  className?: string
}) {
  const { user, className, currentUser } = props
  const isCurrentUser = user.id === currentUser?.id
  const [followsOpen, setFollowsOpen] = useState(false)
  const [followsTab, setFollowsTab] = useState<FollowsDialogTab>('following')
  const followingIds = useFollows(user.id)
  const followerIds = useFollowers(user.id)
  const openFollowsDialog = (tabName: FollowsDialogTab) => {
    setFollowsOpen(true)
    setFollowsTab(tabName)
  }

  const leagueInfo = useLeagueInfo(user.id)

  return (
    <Row
      className={clsx(
        'text-ink-600 flex-wrap items-center gap-x-2 text-sm',
        className
      )}
    >
      <TextButton onClick={() => openFollowsDialog('following')}>
        <span className={clsx('font-semibold')}>
          {followingIds?.length ?? ''}
        </span>{' '}
        Following
      </TextButton>
      <TextButton onClick={() => openFollowsDialog('followers')}>
        <span className={clsx('font-semibold')}>
          {followerIds?.length ?? ''}
        </span>{' '}
        Followers
      </TextButton>

      {isCurrentUser && <UserLikedContractsButton user={user} />}

      {leagueInfo && (
        <Link
          className={linkClass}
          href={getLeaguePath(
            leagueInfo.season,
            leagueInfo.division,
            leagueInfo.cohort,
            user.id
          )}
        >
          <TrophyIcon className="mb-1 mr-1 inline h-4 w-4" />
          <span className={clsx('font-semibold')}>
            {DIVISION_NAMES[leagueInfo.division ?? '']}
          </span>{' '}
          Rank {leagueInfo.rank}
        </Link>
      )}

      {isCurrentUser && (
        <Link href={`/${user.username}/partner`} className={linkClass}>
          <FaCrown className="mb-1 mr-1 inline h-4 w-4" />
          Partner
        </Link>
      )}

      <FollowsDialog
        user={user}
        defaultTab={followsTab}
        followingIds={followingIds}
        followerIds={followerIds}
        isOpen={followsOpen}
        setIsOpen={setFollowsOpen}
      />
    </Row>
  )
}

const ShareButton = (props: {
  user: User
  currentUser: User | undefined | null
}) => {
  const { user, currentUser } = props
  const isSameUser = currentUser?.id === user.id
  const url = `https://${ENV_CONFIG.domain}/${user.username}${
    !isSameUser && currentUser ? referralQuery(currentUser.username) : ''
  }`

  return (
    <Row className={'items-center'}>
      <CopyLinkOrShareButton
        url={url}
        iconClassName={'h-3 !stroke-[3]'}
        className={'-mx-1 gap-1 !px-1 !py-0.5'}
        eventTrackingName={'share user page'}
        tooltip={'Copy link to profile'}
        size={'2xs'}
      >
        <span className={'text-sm'}>Share</span>
      </CopyLinkOrShareButton>
    </Row>
  )
}

function FollowsDialog(props: {
  user: User
  followingIds: string[] | undefined
  followerIds: string[] | undefined
  defaultTab: FollowsDialogTab
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, followingIds, followerIds, defaultTab, isOpen, setIsOpen } =
    props

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="bg-canvas-0 max-h-[90vh] rounded pt-6">
        <div className="px-6 pb-1 text-center text-xl">{user.name}</div>
        <Tabs
          className="mx-6"
          tabs={[
            {
              title: 'Following',
              content: <FollowList userIds={followingIds} />,
            },
            {
              title: 'Followers',
              content: <FollowList userIds={followerIds} />,
            },
          ]}
          defaultIndex={defaultTab === 'following' ? 0 : 1}
        />
      </Col>
    </Modal>
  )
}
