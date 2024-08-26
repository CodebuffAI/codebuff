import { StarIcon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import {
  type Contract,
  type ContractParams,
  tradingAllowed,
} from 'common/contract'
import { mergeWith, uniqBy } from 'lodash'
import Head from 'next/head'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import {
  HistoryPoint,
  MultiBase64Points,
  MultiPoints,
  unserializeBase64Multi,
} from 'common/chart'
import { ContractMetric } from 'common/contract-metric'
import { base64toPoints } from 'common/edge/og'
import { HOUSE_BOT_USERNAME, SPICE_MARKET_TOOLTIP } from 'common/envs/constants'
import { getTopContractMetrics } from 'common/supabase/contract-metrics'
import { parseJsonContentToText } from 'common/util/parse'
import { DAY_MS } from 'common/util/time'
import { UserBetsSummary } from 'web/components/bet/bet-summary'
import { ScrollToTopButton } from 'web/components/buttons/scroll-to-top-button'
import { SidebarSignUpButton } from 'web/components/buttons/sign-up-button'
import { getMultiBetPoints } from 'web/components/charts/contract/choice'
import { BackButton } from 'web/components/contract/back-button'
import { ChangeBannerButton } from 'web/components/contract/change-banner-button'
import { ContractDescription } from 'web/components/contract/contract-description'
import { AuthorInfo } from 'web/components/contract/contract-details'
import { ContractLeaderboard } from 'web/components/contract/contract-leaderboard'
import { ContractOverview } from 'web/components/contract/contract-overview'
import ContractSharePanel from 'web/components/contract/contract-share-panel'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import { DangerZone } from 'web/components/contract/danger-zone'
import { EditableQuestionTitle } from 'web/components/contract/editable-question-title'
import { MarketTopics } from 'web/components/contract/market-topics'
import {
  RelatedContractsGrid,
  SidebarRelatedContractsList,
} from 'web/components/contract/related-contracts-widget'
import { TwombaContractSummaryStats } from 'web/components/contract/twomba-contract-summary-stats'
import { TwombaHeaderActions } from 'web/components/contract/twomba-header-actions'
import { ExplainerPanel } from 'web/components/explainer-panel'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { NumericResolutionPanel } from 'web/components/numeric-resolution-panel'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { Rating, ReviewPanel } from 'web/components/reviews/stars'
import { GradientContainer } from 'web/components/widgets/gradient-container'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { useContractBets } from 'web/hooks/use-bets'
import { useLiveContractWithAnswers } from 'web/hooks/use-contract'
import { useGoogleAnalytics } from 'web/hooks/use-google-analytics'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { useRelatedMarkets } from 'web/hooks/use-related-contracts'
import { useReview } from 'web/hooks/use-review'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveContractVisitsLocally } from 'web/hooks/use-save-visits'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useTracking } from 'web/hooks/use-tracking'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'
import { YourTrades } from '../../pages/[username]/[contractSlug]'
import { useSweepstakes } from '../sweestakes-context'

export function TwombaContractPageContent(props: ContractParams) {
  const {
    comments,
    relatedContracts,
    pointsString,
    multiPointsString,
    chartAnnotations,
    topics,
    dashboards,
    pinnedComments,
    betReplies,
    cash,
  } = props

  const contract = useLiveContractWithAnswers(props.contract)
  if (!contract.viewCount) {
    contract.viewCount = props.contract.viewCount
  }

  const user = useUser()
  const contractMetrics = useSavedContractMetrics(contract)
  const privateUser = usePrivateUser()
  const blockedUserIds = privateUser?.blockedUserIds ?? []
  const [topContractMetrics, setTopContractMetrics] = useState<
    ContractMetric[]
  >(props.topContractMetrics)

  useEffect(() => {
    // If the contract resolves while the user is on the page, get the top contract metrics
    if (contract.resolution && topContractMetrics.length === 0) {
      getTopContractMetrics(contract.id, 10, db).then(setTopContractMetrics)
    }
  }, [contract.resolution, contract.id, topContractMetrics.length])

  useSaveCampaign()
  useGoogleAnalytics()
  useTracking(
    'view market',
    {
      slug: contract.slug,
      contractId: contract.id,
      creatorId: contract.creatorId,
    },
    true,
    [user?.id] // track user view market event if they sign up/sign in on this page
  )
  useSaveContractVisitsLocally(user === null, contract.id)

  const { isPlay } = useSweepstakes()

  const playBetData = useBetData({
    contractId: contract.id,
    outcomeType: contract.outcomeType,
    userId: user?.id,
    lastBetTime: props.lastBetTime,
    totalBets: props.totalBets,
    pointsString,
    multiPointsString,
  })

  const cashBetData = useBetData({
    contractId: cash?.contract.id ?? '',
    outcomeType: cash?.contract.outcomeType,
    userId: user?.id,
    lastBetTime: props.lastBetTime,
    totalBets: cash?.totalBets ?? 0,
    pointsString: cash?.pointsString,
    multiPointsString: cash?.multiPointsString,
  })

  const { bets, totalBets, yourNewBets, betPoints } =
    cashBetData && !isPlay ? cashBetData : playBetData

  const {
    isResolved,
    outcomeType,
    resolution,
    closeTime,
    creatorId,
    coverImageUrl,
  } = contract

  const isAdmin = useAdmin()
  const isMod = useTrusted()
  const isCreator = creatorId === user?.id
  const isClosed = !!(closeTime && closeTime < Date.now())
  const [showResolver, setShowResolver] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [imageError, setImageError] = useState(false)

  useSaveReferral(user, {
    defaultReferrerUsername: contract.creatorUsername,
    contractId: contract.id,
  })

  const [replyTo, setReplyTo] = useState<Answer | Bet>()

  const tabsContainerRef = useRef<null | HTMLDivElement>(null)
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)

  useEffect(() => {
    if (replyTo) {
      setActiveTabIndex(0)
      if (tabsContainerRef.current) {
        scrollIntoViewCentered(tabsContainerRef.current)
      } else {
        console.error('no ref to scroll to')
      }
    }
  }, [replyTo])

  const { contracts: relatedMarkets, loadMore } = useRelatedMarkets(
    contract,
    relatedContracts
  )

  // detect whether header is stuck by observing if title is visible
  const { ref: titleRef, headerStuck } = useHeaderIsStuck()

  const showExplainerPanel =
    user === null || (user && user.createdTime > Date.now() - 3 * DAY_MS)

  const [justNowReview, setJustNowReview] = useState<null | Rating>(null)
  const userReview = useReview(contract.id, user?.id)
  const userHasReviewed = userReview || justNowReview
  const [justBet, setJustBet] = useState(false)
  useEffect(() => {
    if (!user || !user.lastBetTime) return
    const hasJustBet = user.lastBetTime > Date.now() - 3000
    setJustBet(hasJustBet)
  }, [user?.lastBetTime])
  const showRelatedMarketsBelowBet =
    parseJsonContentToText(contract.description).trim().length >= 200

  const isSpiceMarket = !!contract.isSpicePayout

  return (
    <>
      {contract.visibility !== 'public' && (
        <Head>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}

      <Row className="w-full items-start justify-center gap-8">
        <Col
          className={clsx(
            'bg-canvas-0 w-full max-w-3xl rounded-b xl:w-[70%]',
            // Keep content in view when scrolling related questions on desktop.
            'sticky bottom-0 min-h-screen self-end',
            // Accommodate scroll to top button at bottom of page.
            'pb-10 xl:pb-0'
          )}
        >
          <div
            className={clsx(
              'sticky z-50 flex items-end',
              !coverImageUrl
                ? 'bg-canvas-0 top-0 w-full'
                : 'top-[-92px] h-[140px]'
            )}
          >
            {coverImageUrl && !imageError && (
              <div className="absolute -top-10 bottom-0 left-0 right-0 -z-10">
                <Image
                  fill
                  alt=""
                  sizes="100vw"
                  className="object-cover"
                  src={coverImageUrl}
                  onError={() => {
                    track('image error on contract', {
                      contractId: contract.id,
                      imageUrl: coverImageUrl,
                    })
                    setImageError(true)
                  }}
                  priority
                />
                <ChangeBannerButton
                  contract={contract}
                  className="absolute right-4 top-12"
                />
              </div>
            )}
            <Row
              className={clsx(
                'sticky -top-px z-50 h-12 w-full transition-colors',
                headerStuck
                  ? 'dark:bg-canvas-50/80 bg-white/80 backdrop-blur-sm'
                  : ''
              )}
            >
              <Row className="mr-4 grow items-center">
                {(headerStuck || !coverImageUrl) && (
                  <BackButton className="self-stretch pr-8" />
                )}
                {headerStuck && (
                  <span
                    className="text-ink-1000 line-clamp-2 cursor-pointer select-none first:ml-4"
                    onClick={() =>
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                  >
                    {isSpiceMarket && (
                      <Tooltip text={SPICE_MARKET_TOOLTIP}>
                        <SpiceCoin />
                      </Tooltip>
                    )}
                    <VisibilityIcon contract={contract} /> {contract.question}
                  </span>
                )}
              </Row>

              {(headerStuck || !coverImageUrl) && (
                <TwombaHeaderActions contract={contract}>
                  {!coverImageUrl && isCreator && (
                    <ChangeBannerButton
                      contract={contract}
                      className="ml-3 first:ml-0"
                    />
                  )}
                </TwombaHeaderActions>
              )}
            </Row>
          </div>
          {coverImageUrl && (
            <Row className="h-10 w-full justify-between">
              {/* Wrap in div so that justify-between works when BackButton is null. */}
              <div>
                <BackButton className="pr-8" />
              </div>
              <TwombaHeaderActions contract={contract}>
                {!coverImageUrl && isCreator && (
                  <ChangeBannerButton
                    contract={contract}
                    className="ml-3 first:ml-0"
                  />
                )}
              </TwombaHeaderActions>
            </Row>
          )}
          <Col className={clsx('mb-4 p-4 pt-0 md:pb-8 lg:px-8')}>
            <Col className="w-full gap-3 lg:gap-4">
              <Col>
                <div ref={titleRef}>
                  <AuthorInfo
                    contract={contract}
                    className="text-ink-600 mb-0.5"
                  />
                  <VisibilityIcon
                    contract={contract}
                    isLarge
                    className="mr-1"
                  />
                  <EditableQuestionTitle
                    contract={contract}
                    canEdit={isAdmin || isCreator || isMod}
                  />
                </div>
                <Row className="items-center gap-2">
                  <MarketTopics
                    contract={contract}
                    dashboards={dashboards}
                    topics={topics}
                    isSpiceMarket={isSpiceMarket}
                  />
                </Row>
              </Col>

              <div className="text-ink-600 flex flex-wrap items-center justify-end gap-y-1 text-sm">
                <TwombaContractSummaryStats
                  contractId={contract.id}
                  creatorId={contract.creatorId}
                  question={contract.question}
                  financeContract={!isPlay && cash ? cash.contract : contract}
                  editable={isCreator || isAdmin || isMod}
                />
              </div>
              <ContractOverview
                contract={!isPlay && cash ? cash.contract : contract}
                betPoints={betPoints}
                showResolver={showResolver}
                resolutionRating={
                  userHasReviewed ? (
                    <Row className="text-ink-500 items-center gap-0.5 text-sm italic">
                      You rated this resolution{' '}
                      {justNowReview ?? userReview?.rating}{' '}
                      <StarIcon className="h-4 w-4" />
                    </Row>
                  ) : null
                }
                setShowResolver={setShowResolver}
                onAnswerCommentClick={setReplyTo}
                chartAnnotations={chartAnnotations}
              />

              {!tradingAllowed(contract) && (
                <UserBetsSummary
                  className="border-ink-200 !mb-2 "
                  contract={contract}
                />
              )}

              <YourTrades
                contract={!isPlay && cash ? cash.contract : contract}
                yourNewBets={yourNewBets}
              />
            </Col>
            {showRelatedMarketsBelowBet && (
              <RelatedContractsGrid
                contracts={relatedMarkets}
                loadMore={loadMore}
                showOnlyAfterBet={true}
                justBet={justBet}
              />
            )}
            {showReview && user && (
              <div className="relative my-2">
                <ReviewPanel
                  marketId={contract.id}
                  author={contract.creatorName}
                  onSubmit={(rating: Rating) => {
                    setJustNowReview(rating)
                    setShowReview(false)
                  }}
                />
                <button
                  className="text-ink-400 hover:text-ink-600 absolute right-0 top-0 p-4"
                  onClick={() => setShowReview(false)}
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
            )}
            {showResolver &&
              user &&
              (outcomeType === 'PSEUDO_NUMERIC' ? (
                <GradientContainer className="my-2">
                  <NumericResolutionPanel
                    contract={
                      !isPlay && cash
                        ? (cash.contract as typeof contract)
                        : contract
                    }
                    onClose={() => setShowResolver(false)}
                  />
                </GradientContainer>
              ) : outcomeType === 'BINARY' ? (
                <GradientContainer className="my-2">
                  <ResolutionPanel
                    contract={
                      !isPlay && cash
                        ? (cash.contract as typeof contract)
                        : contract
                    }
                    onClose={() => setShowResolver(false)}
                  />
                </GradientContainer>
              ) : null)}

            <DangerZone
              contract={!isPlay && cash ? cash.contract : contract}
              showResolver={showResolver}
              setShowResolver={setShowResolver}
              showReview={showReview}
              setShowReview={setShowReview}
              userHasBet={!!contractMetrics}
              hasReviewed={!!userHasReviewed}
            />
            <ContractDescription contract={contract} />
            <Row className="my-2 flex-wrap items-center justify-between gap-y-2"></Row>
            {!user && <SidebarSignUpButton className="mb-4 flex md:hidden" />}
            {!!user && (
              <ContractSharePanel
                isClosed={isClosed}
                isCreator={isCreator}
                showResolver={showResolver}
                contract={contract}
              />
            )}
            {showExplainerPanel && (
              <div className="bg-canvas-50 -mx-4 p-4 pb-0 md:-mx-8 xl:hidden">
                <h2 className={clsx('text-ink-600  text-xl')}>What is this?</h2>
                <ExplainerPanel />
              </div>
            )}
            {comments.length > 3 && (
              <RelatedContractsGrid
                contracts={relatedMarkets}
                loadMore={loadMore}
                justBet={!showRelatedMarketsBelowBet && justBet}
              />
            )}
            {isResolved && resolution !== 'CANCEL' && (
              <>
                {/* TODO: cash top contract metrics */}
                <ContractLeaderboard
                  topContractMetrics={topContractMetrics.filter(
                    (metric) => metric.userUsername !== HOUSE_BOT_USERNAME
                  )}
                  contractId={contract.id}
                  currentUser={user}
                  currentUserMetrics={contractMetrics}
                />
                <Spacer h={12} />
              </>
            )}

            <div ref={tabsContainerRef} className="mb-4">
              <ContractTabs
                contract={!isPlay && cash ? cash.contract : contract}
                bets={bets}
                totalBets={totalBets}
                comments={comments}
                userPositionsByOutcome={
                  !isPlay && cash
                    ? cash.userPositionsByOutcome
                    : props.userPositionsByOutcome
                }
                totalPositions={
                  !isPlay && cash ? cash.totalPositions : props.totalPositions
                }
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                blockedUserIds={blockedUserIds}
                activeIndex={activeTabIndex}
                setActiveIndex={setActiveTabIndex}
                pinnedComments={pinnedComments}
                // TODO: cash-bet replies???
                betReplies={betReplies}
              />
            </div>
            <RelatedContractsGrid
              contracts={relatedMarkets}
              loadMore={loadMore}
              showAll={true}
            />
          </Col>
        </Col>
        <Col className="hidden min-h-full max-w-[375px] xl:flex">
          {showExplainerPanel && (
            <div>
              <h2 className={clsx('text-ink-600  text-xl')}>What is this?</h2>
              <ExplainerPanel />
            </div>
          )}

          <SidebarRelatedContractsList
            contracts={relatedMarkets}
            loadMore={loadMore}
            topics={topics}
          />
        </Col>
      </Row>

      <ScrollToTopButton className="fixed bottom-16 right-2 z-20 lg:bottom-2 xl:hidden" />
    </>
  )
}

const useBetData = (props: {
  contractId: string
  outcomeType: Contract['outcomeType'] | undefined
  userId: string | undefined
  lastBetTime: number | undefined
  totalBets: number
  pointsString: string | undefined
  multiPointsString: MultiBase64Points | undefined
}) => {
  const {
    contractId,
    userId,
    outcomeType,
    lastBetTime,
    pointsString,
    multiPointsString,
  } = props

  const isNumber = outcomeType === 'NUMBER'

  const newBets = useContractBets(contractId, {
    afterTime: lastBetTime ?? 0,
    includeZeroShareRedemptions: true,
    filterRedemptions: !isNumber,
  })

  const newBetsWithoutRedemptions = newBets.filter((bet) => !bet.isRedemption)
  const totalBets =
    props.totalBets +
    (isNumber
      ? uniqBy(newBetsWithoutRedemptions, 'betGroupId').length
      : newBetsWithoutRedemptions.length)
  const bets = useMemo(
    () => uniqBy(isNumber ? newBets : newBetsWithoutRedemptions, 'id'),
    [newBets.length]
  )
  const yourNewBets = newBets.filter((bet) => userId && bet.userId === userId)

  const betPoints = useMemo(() => {
    if (outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'NUMBER') {
      const data = multiPointsString
        ? unserializeBase64Multi(multiPointsString)
        : []
      const newData = getMultiBetPoints(newBets)

      return mergeWith(data, newData, (array1, array2) =>
        [...(array1 ?? []), ...(array2 ?? [])].sort((a, b) => a.x - b.x)
      ) as MultiPoints
    } else {
      const points = pointsString ? base64toPoints(pointsString) : []
      const newPoints = newBetsWithoutRedemptions.map((bet) => ({
        x: bet.createdTime,
        y: bet.probAfter,
      }))
      return [...points, ...newPoints] as HistoryPoint<Partial<Bet>>[]
    }
  }, [pointsString, newBets.length])

  return {
    bets,
    totalBets,
    yourNewBets,
    betPoints,
  }
}
