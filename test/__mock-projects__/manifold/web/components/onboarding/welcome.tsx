/* eslint-disable react/jsx-key */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Image from 'next/image'

import { STARTING_BALANCE } from 'common/economy'
import { isVerified, User } from 'common/user'
import { buildArray } from 'common/util/array'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { setCachedReferralInfoForUser } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { Group } from 'common/group'
import {
  getSubtopics,
  GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW,
  TOPICS_TO_SUBTOPICS,
} from 'common/topics'
import { intersection, orderBy, uniq, uniqBy } from 'lodash'
import { track } from 'web/lib/service/analytics'
import { PencilIcon } from '@heroicons/react/outline'
import { Input } from '../widgets/input'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { api, updateUser, followTopic, followUser } from 'web/lib/api/api'
import { randomString } from 'common/util/random'
import { unfollowTopic } from 'web/lib/supabase/groups'
import { PillButton } from 'web/components/buttons/pill-button'
import { OnboardingVerifyPhone } from 'web/components/onboarding-verify-phone'
import { removeEmojis } from 'common/util/string'
import { unauthedApi } from 'common/util/api'
import { getSavedContractVisitsLocally } from 'web/hooks/use-save-visits'
import { capitalize } from 'lodash'
import { TRADE_TERM } from 'common/envs/constants'

const FORCE_SHOW_WELCOME_MODAL = false

export function Welcome(props: { setFeedKey?: (key: string) => void }) {
  const { setFeedKey } = props

  const user = useUser()
  const authed = useIsAuthorized()
  const isTwitch = useIsTwitch(user)

  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)

  const shouldShowWelcomeModal =
    FORCE_SHOW_WELCOME_MODAL || (!isTwitch && user && user.shouldShowWelcome)

  const handleSetPage = (page: number) => {
    if (page === 0) {
      track('welcome screen: what is manifold')
    } else if (page === 1) {
      track('welcome screen: how it works')
    } else if (page === 2) {
      track('welcome screen: thank you')
    }
    setPage(page)
  }

  useEffect(() => {
    if (shouldShowWelcomeModal) {
      track('welcome screen: landed', { isTwitch })
      setOpen(true)
    }
  }, [shouldShowWelcomeModal])

  const [userInterestedTopics, setUserInterestedTopics] = useState<Group[]>([])
  const [userBetInTopics, setUserBetInTopics] = useState<Group[]>([])
  const [trendingTopics, setTrendingTopics] = useState<Group[]>([])

  const availablePages = buildArray([
    <WhatIsManifoldPage />,
    <PredictionMarketPage />,
    <TopicsPage
      trendingTopics={trendingTopics}
      userInterestedTopics={userInterestedTopics}
      userBetInTopics={userBetInTopics}
      onNext={increasePage}
      setFeedKey={setFeedKey}
      user={user}
      goBack={() => handleSetPage(page - 1)}
    />,
    user && !isVerified(user) && (
      <OnboardingVerifyPhone onClose={increasePage} />
    ),
  ])
  const showBottomButtons = page < 2

  useEffect(() => {
    if (!authed || !user || !isVerified(user)) return
    // Wait until after they've had the opportunity to change their name
    setCachedReferralInfoForUser(user)
  }, [user, authed])

  const getTrendingAndUserCategories = async (userId: string) => {
    const hardCodedTopicIds = Object.keys(TOPICS_TO_SUBTOPICS)
      .map((topic) => getSubtopics(topic))
      .flat()
      .flatMap(([_, __, groupIds]) => groupIds)
    const [userInterestedTopicsRes, trendingTopicsRes] = await Promise.all([
      unauthedApi('get-interesting-groups-from-views', {
        userId,
        contractIds: getSavedContractVisitsLocally(),
      }),
      run(
        db
          .from('groups')
          .select('id,data')
          .not('id', 'in', `(${hardCodedTopicIds.join(',')})`)
          .not(
            'slug',
            'in',
            `(${GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW.join(',')})`
          )
          .filter('slug', 'not.ilike', '%manifold%')
          .order('importance_score', { ascending: false })
          .limit(9)
      ),
    ])
    const userInterestedTopics = orderBy(
      userInterestedTopicsRes,
      'importanceScore',
      'desc'
    )
    const trendingTopics = trendingTopicsRes.data?.map((groupData) => ({
      ...(groupData?.data as Group),
      id: groupData.id,
    }))

    setTrendingTopics(
      uniqBy(
        [
          ...userInterestedTopics.filter(
            (g) => !hardCodedTopicIds.includes(g.id)
          ),
          ...trendingTopics,
        ],
        (g) => g.id
      ).slice(0, 9)
    )
    if (userInterestedTopics.some((g) => g.hasBet)) {
      setUserBetInTopics(
        userInterestedTopics.filter((g) => g.hasBet).slice(0, 5)
      )
    } else {
      setUserInterestedTopics(userInterestedTopics.slice(0, 5))
    }
  }

  useEffect(() => {
    if (user?.id && shouldShowWelcomeModal && authed)
      getTrendingAndUserCategories(user.id)
  }, [user?.id, shouldShowWelcomeModal, authed])

  async function increasePage() {
    if (page < availablePages.length - 1) handleSetPage(page + 1)
    else {
      if (user) await api('me/update', { shouldShowWelcome: false })
      track('welcome screen: complete')
      setOpen(false)

      if (window.location.pathname === '/home') {
        window.location.reload() // reload to ensure personalized feed
      }
    }
  }

  function decreasePage() {
    if (page > 0) {
      handleSetPage(page - 1)
    }
  }

  if (!shouldShowWelcomeModal) return <></>

  return (
    <Modal open={open} size={'lg'} position={'bottom'}>
      <Col className="bg-canvas-0 rounded-md px-4 py-6 text-sm md:w-full md:text-lg lg:px-8">
        {availablePages[page]}
        <Col>
          {showBottomButtons && (
            <Row className="mt-2 justify-between">
              <Button
                color={'gray-white'}
                className={page === 0 ? 'invisible' : ''}
                onClick={decreasePage}
              >
                Previous
              </Button>
              <Button onClick={increasePage}>Next</Button>
            </Row>
          )}
        </Col>
      </Col>
    </Modal>
  )
}

const useIsTwitch = (user: User | null | undefined) => {
  const router = useRouter()
  const isTwitch = router.pathname === '/twitch'

  useEffect(() => {
    if (isTwitch && user?.shouldShowWelcome) {
      api('me/update', { shouldShowWelcome: false })
    }
  }, [isTwitch, user?.id, user?.shouldShowWelcome])

  return isTwitch
}

function WhatIsManifoldPage() {
  const user = useUser()

  const [name, setName] = useState<string>(user?.name ?? 'friend')
  useEffect(() => {
    if (user?.name) setName(user.name)
  }, [user?.name === undefined])

  const saveName = async () => {
    let newName = cleanDisplayName(name)
    if (!newName) newName = 'User'
    if (newName === user?.name) return
    setName(newName)

    await updateUser({ name: newName })

    let username = cleanUsername(newName)
    try {
      await updateUser({ username })
    } catch (e) {
      username += randomString(5)
      await updateUser({ username })
    }
  }

  const [showOnHover, setShowOnHover] = useState(false)
  const [isEditingUsername, setIsEditingUsername] = useState(false)

  return (
    <>
      <Image
        className="h-1/3 w-1/3 place-self-center object-contain"
        src="/logo.svg"
        alt="Manifold Logo"
        height={256}
        width={256}
      />
      <div className="to-ink-0mt-3 text-primary-700 mb-6 text-center text-2xl font-normal">
        Welcome to Manifold!
      </div>
      <div className="mb-4 flex h-10 flex-row gap-2 text-xl">
        <div className="mt-2">Welcome,</div>
        {isEditingUsername || showOnHover ? (
          <div>
            <Input
              type="text"
              placeholder="Name"
              value={name}
              className="text-lg font-semibold"
              maxLength={30}
              onChange={(e) => {
                setName(e.target.value)
              }}
              onBlur={() => {
                setIsEditingUsername(false)
                saveName()
              }}
              onFocus={() => {
                setIsEditingUsername(true)
                setShowOnHover(false)
              }}
              onMouseLeave={() => setShowOnHover(false)}
            />
          </div>
        ) : (
          <div className="mt-2">
            <span
              className="hover:cursor-pointer hover:border"
              onClick={() => setIsEditingUsername(true)}
              onMouseEnter={() => setShowOnHover(true)}
            >
              <span className="font-semibold">{name}</span>{' '}
              <PencilIcon className="mb-1 inline h-4 w-4" />
            </span>
          </div>
        )}
      </div>
      <div className="mb-4 text-lg">
        {capitalize(TRADE_TERM)} with play money on politics, tech, sports, and
        more. Your {TRADE_TERM}s contribute to the wisdom of the crowd.
      </div>
    </>
  )
}

function PredictionMarketPage() {
  return (
    <>
      <div className="text-primary-700 mb-6 mt-3 text-center text-2xl font-normal">
        How it works
      </div>
      <div className="mt-2 text-lg">
        We've sent you{' '}
        <strong className="text-xl">{formatMoney(STARTING_BALANCE)}</strong> in
        play money. {capitalize(TRADE_TERM)} on the answer you think is right.
      </div>
      <div className="mt-2 text-lg">
        Research shows wagering currency leads to more accurate predictions than
        polls.
      </div>
      <Image
        src="/welcome/manifold-example.gif"
        className="my-4 h-full w-full max-w-xl self-center object-contain"
        alt={'Manifold example animation'}
        width={200}
        height={100}
      />
    </>
  )
}

function TopicsPage(props: {
  onNext?: () => void
  setFeedKey?: (key: string) => void
  trendingTopics: Group[]
  userInterestedTopics: Group[]
  userBetInTopics: Group[]
  goBack?: () => void
  user: User | null | undefined
}) {
  const {
    userInterestedTopics,
    trendingTopics,
    userBetInTopics,
    onNext,
    goBack,
    user,
  } = props

  const [userSelectedTopics, setUserSelectedTopics] = useState<
    string[] | undefined
  >()

  const topics = Object.keys(TOPICS_TO_SUBTOPICS)

  useEffect(() => {
    if (userBetInTopics.length > 0) {
      userBetInTopics.forEach((group) => selectTopic(group.id))
    } else if (userInterestedTopics.length > 0) {
      userInterestedTopics.forEach((group) => selectTopic(group.id))
    }
  }, [])

  const selectTopic = (groupId: string) => {
    if (selectedTopics.includes(groupId)) {
      if (user) unfollowTopic(groupId, user.id).catch((e) => console.error(e))
      setUserSelectedTopics((tops) => (tops ?? []).filter((t) => t !== groupId))
    } else {
      setUserSelectedTopics((tops) => uniq([...(tops ?? []), groupId]))
      if (user) followTopic({ groupId }).catch((e) => console.error(e))
    }
  }

  const [isLoading, setIsLoading] = useState(false)

  const closeDialog = async () => {
    setIsLoading(true)

    if (user) {
      // Don't await as this takes a long time.
      api('update-user-embedding', {})
    }

    // if user is following us politics
    if (
      intersection(selectedTopics, [
        'AjxQR8JMpNyDqtiqoA96',
        'pYwsGvORZFlcq7QrkI6n',
        'cEzcLXuitr6o4VPI01Q1',
      ]).length > 0
    ) {
      await followUser('vuI5upWB8yU00rP7yxj95J2zd952') // follow @ManifoldPolitics
    }

    // if user is following AI topics
    if (
      intersection(selectedTopics, [
        'yEWvvwFFIqzf8JklMewp',
        'a3ikurqO9fT46Pv9ZGkY',
        'GbbX9U5pYnDeftX9lxUh',
      ]).length > 0
    ) {
      await followUser('8lZo8X5lewh4hnCoreI7iSc0GxK2') // follow @ManifoldAI
    }

    if (
      intersection(selectedTopics, ['0d39aa2b-1447-4298-bc60-5ef67d9cea4f'])
        .length > 0
    ) {
      await followUser('fBFdG15kdfeBmjRVEajSMLayZ2y1') // follow @JasonTweenieMemes
    }

    onNext?.()
  }
  const selectedTopics: string[] = userSelectedTopics ?? []

  const pillButton = (
    topicWithEmoji: string,
    topicName: string,
    groupIds: string[]
  ) => (
    <PillButton
      key={topicName}
      selected={groupIds.every((g) => selectedTopics.includes(g))}
      onSelect={() => {
        groupIds.map((g) => selectTopic(g))
        track('onboarding select topic', { name: topicName })
      }}
    >
      {topicWithEmoji}
    </PillButton>
  )

  return (
    <Col>
      <div className="text-primary-700 mb-6 text-center text-2xl font-normal">
        What interests you?
      </div>
      <div className="mb-4 text-lg">
        Select 3 or more topics to personalize your experience.
      </div>
      <Col className="h-[25rem] gap-2 overflow-y-auto sm:h-[32rem]">
        <Col className={'gap-1'}>
          <div className="text-ink-700 text-sm">
            {userInterestedTopics.length > 0 || userBetInTopics.length > 0
              ? 'Suggested'
              : 'Trending now'}
          </div>
          <Row className={'flex-wrap gap-1'}>
            {trendingTopics.map((group) => (
              <div className="" key={group.id + '-section'}>
                {pillButton(group.name, removeEmojis(group.name), [group.id])}
              </div>
            ))}
          </Row>
        </Col>

        {topics.map((topic) => (
          <Col className="mb-3 gap-1" key={topic + '-section'}>
            <div className="text-ink-700 text-sm">{topic.slice(3)}</div>
            <Row className="flex flex-wrap gap-x-1 gap-y-1.5">
              {getSubtopics(topic)
                .filter(([_, __, groupId]) => !!groupId)
                .map(([subtopicWithEmoji, subtopic, groupIds]) => {
                  return pillButton(subtopicWithEmoji, subtopic, groupIds)
                })}
            </Row>
          </Col>
        ))}
      </Col>
      <Row className={'mt-4 justify-between'}>
        <Button onClick={goBack} color={'gray-white'}>
          Previous
        </Button>
        <Button
          onClick={closeDialog}
          disabled={(userSelectedTopics ?? []).length <= 2}
          loading={isLoading}
        >
          Next
        </Button>
      </Row>
    </Col>
  )
}
