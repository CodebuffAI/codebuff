import clsx from 'clsx'
import { type DisplayUser } from 'common/api/user-types'
import { DESTINY_GROUP_SLUG, HOUSE_BOT_USERNAME } from 'common/envs/constants'
import { Group, LiteGroup } from 'common/group'
import { removeEmojis } from 'common/util/string'
import { BETTORS } from 'common/user'
import { buildArray } from 'common/util/array'
import { formatMoney } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import { first, uniqBy } from 'lodash'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { Leaderboard } from 'web/components/leaderboard'
import LoadingUserRows from 'web/components/loading-user-rows'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import {
  useTrendingTopics,
  useUserTrendingTopics,
} from 'web/components/search/query-topics'
import { SupabaseSearch } from 'web/components/supabase-search'
import { QuestionsTopicTitle } from 'web/components/topics/questions-topic-title'
import { Content } from 'web/components/widgets/editor'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTopicFromRouter } from 'web/hooks/use-topic-from-router'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { getGroupFromSlug } from 'web/lib/supabase/group'
import { getDisplayUsers } from 'web/lib/supabase/users'
import Custom404 from 'web/pages/404'

type UserStat = { user: DisplayUser; score: number }
type TopicParams = {
  name: string
  slug: string
  topTraders: UserStat[]
  topCreators: UserStat[]
}
const toTopUsers = async (
  cachedUserIds: { userId: string; score: number }[]
): Promise<{ user: DisplayUser; score: number }[]> => {
  const userData = await getDisplayUsers(cachedUserIds.map((u) => u.userId))
  const usersById = Object.fromEntries(userData.map((u) => [u?.id, u]))
  return cachedUserIds
    .map((e) => ({
      user: usersById[e.userId],
      score: e.score,
    }))
    .filter((e) => e.user != null)
}

export async function getStaticProps(props: { params: { slug: string[] } }) {
  const slug = first(props.params.slug)
  const topic = slug ? await getGroupFromSlug(slug) : null

  if (!topic) {
    return {
      props: {
        slug: slug ?? null,
      },
    }
  }

  if (slug != topic.slug) {
    return {
      redirect: {
        destination: `/browse/${topic.slug}`,
        permanent: true,
      },
    }
  }

  const cachedTopTraderIds = topic.cachedLeaderboard?.topTraders ?? []
  const cachedTopCreatorIds = topic.cachedLeaderboard?.topCreators ?? []
  const topTraders = await toTopUsers(cachedTopTraderIds)
  const topCreators = await toTopUsers(cachedTopCreatorIds)

  return {
    props: removeUndefinedProps({
      slug: slug ?? null,
      staticTopicParams: {
        name: topic.name,
        slug: topic.slug,
        topTraders: topTraders ?? [],
        topCreators: topCreators ?? [],
      },
      revalidate: 60 * 10, // regenerate after 10 minutes
    }),
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function BrowseGroupPage(props: {
  slug: string
  staticTopicParams?: TopicParams
}) {
  const { slug, staticTopicParams } = props
  if (!staticTopicParams && slug !== null) {
    return <Custom404 />
  }

  return (
    <>
      <SEO
        title={`${staticTopicParams?.name ?? 'Browse'}`}
        description={`Browse ${staticTopicParams?.name ?? 'all'} questions`}
        url={`/browse${staticTopicParams ? `/${staticTopicParams.slug}` : ''}`}
      />
      <Page trackPageView={'questions page'}>
        <GroupPageContent slug={slug} staticTopicParams={staticTopicParams} />
      </Page>
    </>
  )
}

export function GroupPageContent(props: {
  staticTopicParams?: TopicParams
  slug: string | null
}) {
  const { staticTopicParams } = props
  const slug = props.slug ?? undefined
  const user = useUser()
  const isMobile = useIsMobile()
  const router = useRouter()
  const { q } = router.query
  // Allow users to browse without keyboard popping up on mobile.
  const autoFocus = !isMobile && !q
  const privateUser = usePrivateUser()

  useSaveReferral(user)
  const shouldFilterDestiny = false // useShouldBlockDestiny(user?.id)

  const trendingTopics = useTrendingTopics(
    50,
    'home-page-trending-topics'
  ) as Group[]
  const userTrendingTopics = useUserTrendingTopics(user, 25)

  const topicSlug = useFirstSlugFromRouter() ?? slug
  const { slug: _, ...otherQueryParams } = router.query
  const queryParams = new URLSearchParams(
    otherQueryParams as Record<string, string>
  )

  const setTopicSlugClearQuery = (slug: string) => {
    queryParams.delete('q')
    queryParams.delete('t')
    queryParams.delete('tf')
    const queryStr = queryParams.toString()
    const q = queryStr ? `?${queryStr}` : ''
    router.push(`/browse/${slug}${q}`, undefined, { shallow: true })
  }

  const topicsByImportance = combineGroupsByImportance(
    trendingTopics ?? [],
    userTrendingTopics ?? []
  ).filter((t) => !EXCLUDED_TOPIC_SLUGS.includes(t.slug))

  const topicFromRouter = useTopicFromRouter(topicSlug)
  const [topicsFromRouter, setTopicsFromRouter] = usePersistentInMemoryState<
    Group[]
  >([], 'topics-from-router')

  useEffect(() => {
    const newTopic =
      topicFromRouter &&
      !topicsByImportance.map((g) => g.id).includes(topicFromRouter.id) &&
      !topicsFromRouter.map((g) => g.id).includes(topicFromRouter.id)
    if (newTopic) setTopicsFromRouter((topics) => [...topics, topicFromRouter])
  }, [topicFromRouter])

  const allTopics = buildArray(topicsFromRouter, topicsByImportance)
  const [topicResults, setTopicResults] = usePersistentInMemoryState<
    LiteGroup[] | undefined
  >(undefined, `search-topic-results`)

  const shownTopics = q && topicResults?.length ? topicResults : undefined
  const initialTopics = topicsByImportance

  const currentTopic = allTopics.find((t) => t.slug === topicSlug)
  const staticTopicIsCurrent = staticTopicParams?.slug === currentTopic?.slug

  const searchComponent = (
    <SupabaseSearch
      persistPrefix="search"
      autoFocus={autoFocus}
      additionalFilter={{
        excludeContractIds: privateUser?.blockedContractIds,
        excludeGroupSlugs: buildArray(
          privateUser?.blockedGroupSlugs,
          shouldFilterDestiny &&
            DESTINY_GROUP_SLUG != topicSlug &&
            DESTINY_GROUP_SLUG
        ),
        excludeUserIds: privateUser?.blockedUserIds,
      }}
      useUrlParams
      isWholePage
      headerClassName={'pt-0 px-2 bg-canvas-50'}
      setTopics={setTopicResults}
      topicSlug={topicSlug}
      defaultFilter="open"
      defaultSort="score"
      defaultForYou="1"
      shownTopics={shownTopics}
      initialTopics={initialTopics}
      setTopicSlug={(slug) => {
        setTopicSlugClearQuery(slug === topicSlug ? '' : slug)
      }}
    />
  )

  return (
    <div>
      <QuestionsTopicTitle
        currentTopic={currentTopic}
        topicSlug={topicSlug}
        user={user}
        setTopicSlug={setTopicSlugClearQuery}
      />
      <div className="flex md:contents">
        <Col className={clsx('relative col-span-8 mx-auto w-full')}>
          {!currentTopic && searchComponent}
          {currentTopic && (
            <QueryUncontrolledTabs
              className={'px-1'}
              renderAllTabs={false}
              tabs={buildArray(
                {
                  content: searchComponent,
                  title: 'Browse',
                },
                currentTopic && [
                  {
                    title: 'Leaderboards',
                    content: (
                      <Col className={''}>
                        <div className="text-ink-500 mb-4 mt-2 text-sm">
                          Updates every 15 minutes
                        </div>
                        <Col className="gap-2 ">
                          <GroupLeaderboard
                            topic={currentTopic}
                            type={'trader'}
                            cachedTopUsers={
                              staticTopicIsCurrent
                                ? staticTopicParams?.topTraders
                                : undefined
                            }
                          />
                          <GroupLeaderboard
                            topic={currentTopic}
                            type={'creator'}
                            cachedTopUsers={
                              staticTopicIsCurrent
                                ? staticTopicParams?.topCreators
                                : undefined
                            }
                            noFormatting={true}
                          />
                        </Col>
                      </Col>
                    ),
                  },
                  {
                    title: 'About',
                    content: (
                      <Col className="w-full">
                        {currentTopic.bannerUrl && (
                          <div className="relative h-[200px]">
                            <Image
                              fill
                              src={currentTopic.bannerUrl}
                              sizes="100vw"
                              className="object-cover"
                              alt=""
                            />
                          </div>
                        )}
                        <div className="text-ink-500 mb-4 mt-2 text-sm">
                          {currentTopic.privacyStatus} topic created
                          {currentTopic.creatorId === user?.id && ' by you'}
                          <RelativeTimestamp
                            time={currentTopic.createdTime}
                            className="!text-ink-500"
                          />{' '}
                          • {currentTopic.totalMembers ?? 0} followers
                          {currentTopic.postIds?.length
                            ? ` • ${currentTopic.postIds.length} posts`
                            : undefined}
                        </div>

                        {currentTopic.about && (
                          <Content
                            size="lg"
                            className="p-4 sm:p-6"
                            content={currentTopic.about}
                          />
                        )}
                      </Col>
                    ),
                  },
                ]
              )}
            />
          )}
        </Col>
      </div>
    </div>
  )
}

const EXCLUDED_TOPIC_SLUGS = [
  'politics-default',
  '2024-us-presidential-election',
]

const combineGroupsByImportance = (
  resultGroups: Group[],
  myGroups: Group[]
) => {
  const combined = [
    ...myGroups,
    ...resultGroups.filter((g) => !myGroups.map((g) => g.id).includes(g.id)),
  ]

  return uniqBy(combined, (g) => removeEmojis(g.name).toLowerCase())
}
const MAX_LEADERBOARD_SIZE = 50

function GroupLeaderboard(props: {
  topic: Group
  type: 'creator' | 'trader'
  cachedTopUsers: UserStat[] | undefined
  noFormatting?: boolean
}) {
  const { type, topic, cachedTopUsers, noFormatting } = props

  const title = type === 'trader' ? `🏅 Top ${BETTORS}` : `🏅 Top creators`
  const header = type === 'trader' ? 'Profit' : 'Traders'
  const uncachedTopUsers =
    (type === 'trader'
      ? topic.cachedLeaderboard?.topTraders
      : topic.cachedLeaderboard?.topCreators) ?? []
  const topUsers = (
    cachedTopUsers ?? // eslint-disable-next-line react-hooks/rules-of-hooks
    useToTopUsers(uncachedTopUsers) ??
    []
  ).filter((u) => u.user.username !== HOUSE_BOT_USERNAME)
  const scoresByUser = Object.fromEntries(
    topUsers.map((u) => [u.user.id, u.score])
  )
  if (!topUsers.length) {
    return (
      <Col className={'px-1'}>
        <Title>{title}</Title>
        <LoadingUserRows />
      </Col>
    )
  }

  return (
    <Leaderboard
      entries={topUsers.map((t) => t.user)}
      title={title}
      columns={[
        {
          header,
          renderCell: (user) =>
            noFormatting
              ? scoresByUser[user.id]
              : formatMoney(scoresByUser[user.id]),
        },
      ]}
      maxToShow={MAX_LEADERBOARD_SIZE}
    />
  )
}

function useToTopUsers(
  userScores: { userId: string; score: number }[]
): UserStat[] | null {
  const [topUsers, setTopUsers] = useState<UserStat[]>([])
  useEffect(() => {
    if (topUsers) setTopUsers([])
    toTopUsers(userScores).then((result) => setTopUsers(result as UserStat[]))
  }, [userScores])
  return topUsers && topUsers.length > 0 ? topUsers : null
}

const useFirstSlugFromRouter = () => {
  const router = useRouter()
  const { slug } = router.query
  if (!router.isReady) return undefined
  return first(slug) ?? ''
}
