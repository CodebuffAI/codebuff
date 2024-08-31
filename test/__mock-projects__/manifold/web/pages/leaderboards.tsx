import { Col } from 'web/components/layout/col'
import { Leaderboard } from 'web/components/leaderboard'
import { Page } from 'web/components/layout/page'
import { User } from 'web/lib/firebase/users'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { useEffect, useState } from 'react'
import { Title } from 'web/components/widgets/title'
import { SEO } from 'web/components/SEO'
import { BETTORS } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import {
  getTopReferrals,
  getUserReferralsInfo,
} from 'common/supabase/referrals'
import { db } from 'web/lib/supabase/db'
import {
  getCreatorRank,
  getDisplayUsers,
  getProfitRank,
  getTopCreators,
  getTopTraders,
} from 'web/lib/supabase/users'
import { Group, TOPIC_KEY } from 'common/group'
import { Row } from 'web/components/layout/row'
import { TopicSelector } from 'web/components/topics/topic-selector'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { Modal } from 'web/components/layout/modal'
import { PencilIcon, TagIcon, XIcon } from '@heroicons/react/outline'
import { DotsVerticalIcon } from '@heroicons/react/solid'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { useTopicFromRouter } from 'web/hooks/use-topic-from-router'
import { BackButton } from 'web/components/contract/back-button'
import { filterDefined } from 'common/util/array'
import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'

export async function getStaticProps() {
  const allTime = await queryLeaderboardUsers().catch(() => ({
    topTraders: [],
    topCreators: [],
  }))

  const topReferrals = await getTopReferrals(db).catch(() => [])

  return {
    props: {
      allTime,
      topReferrals,
    },
    revalidate: 60 * 15, // regenerate after 15 minutes
  }
}

const queryLeaderboardUsers = async () => {
  const [topTraders, topCreators] = await Promise.all([
    getTopTraders().then((users) =>
      users
        .filter((u) => !HIDE_FROM_LEADERBOARD_USER_IDS.includes(u.user_id))
        .slice(0, 20)
    ),
    getTopCreators(),
  ])
  return {
    topTraders,
    topCreators,
  }
}

type Leaderboard = Awaited<ReturnType<typeof queryLeaderboardUsers>>
type ReferralLeaderboard = Awaited<ReturnType<typeof getTopReferrals>>

type Ranking = {
  profitRank: number
  tradersRank: number
  referralsRank: number
}

export default function Leaderboards(props: {
  allTime: Leaderboard
  topReferrals: ReferralLeaderboard
}) {
  const [myRanks, setMyRanks] = useState<Ranking>()
  const [userReferralInfo, setUserReferralInfo] =
    useState<Awaited<ReturnType<typeof getUserReferralsInfo>>>()
  const [showSelectGroupModal, setShowSelectGroupModal] = useState(false)
  const user = useUser()
  const currentHistory = useCurrentPortfolio(user?.id)

  useEffect(() => {
    if (!user?.profitCached) return
    ;(async () => {
      const rankings = {} as Ranking
      rankings.profitRank = await getProfitRank(user.id)
      rankings.tradersRank = await getCreatorRank(user.id)

      const referrerInfo = await getUserReferralsInfo(user.id, db)
      setUserReferralInfo(referrerInfo)
      rankings.referralsRank = referrerInfo.rank

      setMyRanks(rankings)
    })()
  }, [user?.creatorTraders, user?.profitCached])

  const { topReferrals } = props
  const [topicSlug, setTopicSlug] = usePersistentQueryState(TOPIC_KEY, '')
  const topicFromRouter = useTopicFromRouter(topicSlug)
  const [topic, setTopic] = useState<Group>()
  useEffect(() => {
    setTopic(topicFromRouter)
  }, [topicFromRouter])
  const topTopicTraders = useToTopUsers(
    topic && topic.cachedLeaderboard?.topTraders
  )?.map((c) => ({
    ...c.user,
    profitCached: {
      allTime: c.score,
    },
  }))

  const topTopicCreators = useToTopUsers(
    topic && topic.cachedLeaderboard?.topCreators
  )?.map((c) => ({
    ...c.user,
    creatorTraders: {
      allTime: c.score,
    },
  }))

  const { topTraders, topCreators } = props.allTime

  const topTraderEntries = (
    topic && topTopicTraders
      ? topTopicTraders.map((u) => ({
          ...u,
          score: u.profitCached.allTime,
        }))
      : topTraders.map((u) => ({
          name: u.name,
          username: u.username,
          avatarUrl: u.avatar_url,
          score: u.profit,
          id: u.user_id,
        }))
  ).map((user, i) => ({
    ...user,
    rank: i + 1,
  }))
  const topCreatorEntries = (
    topic && topTopicCreators
      ? topTopicCreators.map((u) => ({
          ...u,
          score: u.creatorTraders.allTime,
        }))
      : topCreators.map((u) => ({
          name: u.name,
          username: u.username,
          avatarUrl: u.avatar_url,
          score: u.total_traders,
          id: u.user_id,
        }))
  ).map((user, i) => ({
    ...user,
    rank: i + 1,
  }))

  if (user && currentHistory && myRanks != null && !topic) {
    if (
      myRanks.profitRank != null &&
      !topTraderEntries.find((x) => x.id === user.id)
    ) {
      topTraderEntries.push({
        ...user,
        score: currentHistory.profit ?? user.profitCached.allTime,
        rank: myRanks.profitRank,
      })
    }
    if (
      myRanks.tradersRank != null &&
      !topCreatorEntries.find((x) => x.id === user.id)
    ) {
      topCreatorEntries.push({
        ...user,
        score: user.creatorTraders.allTime,
        rank: myRanks.tradersRank,
      })
    }
    // Currently only set for allTime
    if (
      myRanks.referralsRank != null &&
      !topReferrals.find((x) => x.id === user.id)
    ) {
      topReferrals.push({
        ...user,
        rank: myRanks.referralsRank,
        totalReferrals: userReferralInfo?.total_referrals ?? 0,
        totalReferredProfit: userReferralInfo?.total_referred_profit ?? 0,
      })
    }
  }

  return (
    <Page trackPageView={'leaderboards'}>
      <SEO
        title="Leaderboards"
        description={`Manifold's leaderboards show the top ${BETTORS}, question creators, and referrers.`}
        url="/leaderboards"
      />
      <Col className="mb-4 p-2">
        <Row className={'mb-4 items-center justify-between '}>
          <Row className={'items-center gap-2'}>
            <BackButton className={'md:hidden'} />
            <Title className={'!mb-0'}>
              Leaderboards <InfoTooltip text="Updated every 15 minutes" />
            </Title>
          </Row>
          <DropdownMenu
            icon={<DotsVerticalIcon className={'h-5 w-5'} />}
            menuWidth={'w-48'}
            items={[
              {
                name: topic ? 'Change topic' : 'Filter by topic',
                onClick: () => setShowSelectGroupModal(true),
                icon: topic ? (
                  <PencilIcon
                    className="text-ink-400 h-5 w-5"
                    aria-hidden="true"
                  />
                ) : (
                  <TagIcon
                    className="text-ink-400 h-5 w-5"
                    aria-hidden="true"
                  />
                ),
              },
            ]}
          />
        </Row>

        <Col className="items-center gap-10 lg:flex-row lg:items-start">
          <Leaderboard
            title={`🏅 ${topic?.name ?? 'Top'} ${BETTORS}`}
            entries={topTraderEntries}
            columns={[
              {
                header: 'Profit',
                renderCell: (user) => formatMoney(user.score),
              },
            ]}
            highlightUsername={user?.username}
          />

          <Leaderboard
            title={`🏅 ${topic?.name ?? 'Top'} creators`}
            entries={topCreatorEntries}
            columns={[
              {
                header: 'Traders',
                renderCell: (user) => formatWithCommas(user.score),
              },
            ]}
            highlightUsername={user?.username}
          />
        </Col>
        {!topic && (
          <Col className="mx-4 my-10 items-center gap-10 lg:mx-0 lg:w-[35rem] lg:flex-row">
            <Leaderboard
              title="🏅 Top Referrers"
              entries={topReferrals}
              columns={[
                {
                  header: 'Referrals',
                  renderCell: (user) => user.totalReferrals,
                },
                {
                  header: (
                    <span>
                      Referred profits
                      <InfoTooltip
                        text={'Total profit earned by referred users'}
                      />
                    </span>
                  ),
                  renderCell: (user) =>
                    formatMoney(user.totalReferredProfit ?? 0),
                },
              ]}
              highlightUsername={user?.username}
            />
          </Col>
        )}
      </Col>
      <SelectTopicModal
        open={showSelectGroupModal}
        setOpen={setShowSelectGroupModal}
        setGroup={(group) => {
          setTopicSlug(group?.slug ?? '')
        }}
        group={topic}
      />
    </Page>
  )
}

const SelectTopicModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
  group?: Group
  setGroup: (group: Group | undefined) => void
}) => {
  const { open, group, setOpen, setGroup } = props
  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <Col className={'bg-canvas-50 min-h-[25rem] rounded-xl p-4'}>
        <Title className={''}>Filter leaderboards by topic</Title>
        {group && (
          <Row className={'items-center justify-between gap-2'}>
            <span className={'text-ink-900 text-lg font-bold'}>
              {group.name}
            </span>
            <button
              onClick={() => {
                setGroup(undefined)
              }}
            >
              <XIcon className="hover:text-ink-700 text-ink-400 ml-1 h-4 w-4" />
            </button>
          </Row>
        )}
        <Col className={''}>
          <TopicSelector
            setSelectedGroup={(group) => {
              setGroup(group)
              setOpen(false)
            }}
          />
        </Col>
      </Col>
    </Modal>
  )
}

const toTopUsers = async (
  cachedUserIds: { userId: string; score: number }[]
): Promise<{ user: User | null; score: number }[]> => {
  const userData = filterDefined(
    await getDisplayUsers(cachedUserIds.map((u) => u.userId))
  )
  const usersById = Object.fromEntries(userData.map((u) => [u.id, u as User]))
  return cachedUserIds
    .map((e) => ({
      user: usersById[e.userId],
      score: e.score,
    }))
    .filter((e) => e.user != null)
}

function useToTopUsers(
  cachedUserIds: { userId: string; score: number }[] | undefined
): UserStats[] | undefined {
  const [topUsers, setTopUsers] = useState<UserStats[]>()
  useEffect(() => {
    if (cachedUserIds)
      toTopUsers(cachedUserIds).then((result) =>
        setTopUsers(result as UserStats[])
      )
  }, [JSON.stringify(cachedUserIds)])
  return topUsers && topUsers.length > 0 ? topUsers : undefined
}

type UserStats = { user: User; score: number }
