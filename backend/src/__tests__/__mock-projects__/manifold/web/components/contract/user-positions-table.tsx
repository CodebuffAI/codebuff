import clsx from 'clsx'
import {
  BinaryContract,
  CPMMContract,
  CPMMMultiContract,
  getMainBinaryMCAnswer,
  isBinaryMulti,
} from 'common/contract'
import {
  ContractMetric,
  ContractMetricsByOutcome,
} from 'common/contract-metric'
import {
  convertContractMetricRows,
  getContractMetricsCount,
  getOrderedContractMetricRowsForContractId,
} from 'common/supabase/contract-metrics'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { countBy, first, orderBy, partition, uniqBy } from 'lodash'
import { memo, useEffect, useMemo, useState } from 'react'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon.svg'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  BuyLabel,
  HigherLabel,
  LowerLabel,
  NoLabel,
  OutcomeLabel,
  ShortLabel,
  YesLabel,
} from 'web/components/outcome-label'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'
import { Pagination } from 'web/components/widgets/pagination'
import { UserLink } from 'web/components/widgets/user-link'
import { useFollows } from 'web/hooks/use-follows'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { db } from 'web/lib/supabase/db'
import { getStonkDisplayShares } from 'common/stonk'
import { PillButton } from 'web/components/buttons/pill-button'
import { Carousel } from 'web/components/widgets/carousel'
import { Answer } from 'common/answer'
import { Select } from '../widgets/select'
import { UserHovercard } from '../user/user-hovercard'

export const UserPositionsTable = memo(
  function UserPositionsTableContent(props: {
    contract: BinaryContract | CPMMMultiContract
    positions?: ContractMetricsByOutcome
    setTotalPositions?: (totalPositions: number) => void
    answerDetails?: {
      answer: Answer
      totalPositions: number
    }
  }) {
    const { contract, setTotalPositions, answerDetails } = props
    const answer = answerDetails?.answer
    const contractId = contract.id

    useEffect(() => {
      if (!props.positions) updateContractMetrics(sortBy, currentAnswerId)
    }, [])

    const [contractMetricsOrderedByProfit, setContractMetricsOrderedByProfit] =
      useState<ContractMetric[] | undefined>()
    const [contractMetricsOrderedByShares, setContractMetricsOrderedByShares] =
      useState<ContractMetric[] | undefined>(
        props.positions ? Object.values(props.positions).flat() : undefined
      )
    const [metricsCountsByAnswerId, setMetricsCountsByAnswerId] = useState<{
      [key: string]: number
    }>(
      answerDetails
        ? { [answerDetails.answer.id]: answerDetails.totalPositions }
        : countBy(
            Object.values(props.positions ?? []).flat(),
            (position) => position.answerId
          )
    )
    const answers = answer
      ? [answer]
      : contract.mechanism === 'cpmm-multi-1'
      ? contract.answers
      : []

    const [currentAnswerId, setCurrentAnswerId] = useState<string | undefined>(
      answers.length > 0
        ? getMainBinaryMCAnswer(contract)?.id ??
            first(orderBy(answers, 'totalLiquidity', 'desc'))?.id
        : undefined
    )
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(!props.positions)
    const [totalYesPositions, setTotalYesPositions] = useState(
      props.positions?.YES?.length ?? 0
    )
    const [totalNoPositions, setTotalNoPositions] = useState(
      props.positions?.NO?.length ?? 0
    )
    const [sortBy, setSortBy] = useState<'profit' | 'shares'>(
      contract.isResolved ? 'profit' : 'shares'
    )

    const updateContractMetrics = async (
      sortBy: 'profit' | 'shares',
      answerId?: string
    ) => {
      setLoading(true)
      const rows = await getOrderedContractMetricRowsForContractId(
        contractId,
        db,
        answerId,
        sortBy
      )
      sortBy === 'profit'
        ? setContractMetricsOrderedByProfit((prev) =>
            uniqBy(
              convertContractMetricRows(rows).concat(prev ?? []),
              (cm) => cm.userId + cm.answerId + cm.contractId
            )
          )
        : setContractMetricsOrderedByShares((prev) =>
            uniqBy(
              convertContractMetricRows(rows).concat(prev ?? []),
              (cm) => cm.userId + cm.answerId + cm.contractId
            )
          )
      setLoading(false)
    }

    useEffect(() => {
      getContractMetricsCount(contractId, db, 'yes', currentAnswerId).then(
        setTotalYesPositions
      )
      getContractMetricsCount(contractId, db, 'no', currentAnswerId).then(
        setTotalNoPositions
      )
    }, [currentAnswerId, contractId])

    const getAllAnswerPositionCounts = async () => {
      if (!setTotalPositions) return
      const count = await getContractMetricsCount(contractId, db)
      setTotalPositions(count)
      if (contract.mechanism == 'cpmm-1') return
      const allCounts = Object.fromEntries(
        await Promise.all(
          answers.map(async (answer) => {
            const count = await getContractMetricsCount(
              contractId,
              db,
              undefined,
              answer.id
            )
            return [answer.id, count]
          })
        )
      )
      setMetricsCountsByAnswerId(allCounts)
    }
    useEffect(() => {
      getAllAnswerPositionCounts()
    }, [])

    const positionsToDisplay = contractMetricsOrderedByShares?.filter((cm) =>
      currentAnswerId ? cm.answerId === currentAnswerId : !cm.answerId
    )
    const profitPositionsToDisplay = contractMetricsOrderedByProfit?.filter(
      (cm) => (currentAnswerId ? cm.answerId === currentAnswerId : !cm.answerId)
    )

    if (contract.mechanism === 'cpmm-1' || isBinaryMulti(contract)) {
      return (
        <Col className={'w-full'}>
          <Row className={'mb-2 items-center justify-end gap-2'}>
            <SortRow
              sort={sortBy === 'profit' ? 'profit' : 'position'}
              onSortClick={() => {
                const newSort = sortBy === 'shares' ? 'profit' : 'shares'
                setSortBy(newSort)
                setPage(0)
                updateContractMetrics(newSort)
              }}
            />
          </Row>
          <BinaryUserPositionsTable
            loading={loading}
            contract={contract}
            positionsByShares={positionsToDisplay}
            positionsByProfit={profitPositionsToDisplay}
            totalYesPositions={totalYesPositions}
            totalNoPositions={totalNoPositions}
            sortBy={sortBy}
            page={page}
            setPage={setPage}
            loadingPositions={Math.max(totalYesPositions, totalNoPositions)}
          />
        </Col>
      )
    } else if (contract.mechanism === 'cpmm-multi-1') {
      return (
        <Col className={'w-full'}>
          {!answer && answers.length < 4 && (
            <Carousel labelsParentClassName={'gap-1'}>
              {orderBy(
                answers,
                (answer) => metricsCountsByAnswerId[answer.id] ?? answer.text,
                'desc'
              ).map((answer) => (
                <PillButton
                  key={answer.id}
                  selected={answer.id === currentAnswerId}
                  onSelect={() => {
                    setCurrentAnswerId(answer.id)
                    updateContractMetrics(sortBy, answer.id)
                  }}
                >
                  <Row className={'gap-1'}>
                    <span className={'max-w-[60px] truncate text-ellipsis'}>
                      {answer.text}
                    </span>
                    {metricsCountsByAnswerId[answer.id]
                      ? ` (${metricsCountsByAnswerId[answer.id]})`
                      : ''}
                  </Row>
                </PillButton>
              ))}
            </Carousel>
          )}

          <Row className={'mb-2 mt-1 items-center justify-between gap-2'}>
            <Row className={'font-semibold '}>
              {answers.length >= 4 ? (
                <Select
                  className="h-9 w-full max-w-sm"
                  value={currentAnswerId}
                  onChange={(e) => {
                    setCurrentAnswerId(e.target.value)
                    updateContractMetrics(sortBy, e.target.value)
                  }}
                >
                  {orderBy(
                    answers,
                    (answer) =>
                      metricsCountsByAnswerId[answer.id] ?? answer.text,
                    'desc'
                  ).map((answer) => (
                    <option key={answer.id} value={answer.id}>
                      {answer.text}{' '}
                      {metricsCountsByAnswerId[answer.id]
                        ? ` (${metricsCountsByAnswerId[answer.id]})`
                        : ''}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className={'line-clamp-1 '}>
                  {answers.find((a) => a.id === currentAnswerId)?.text}
                </span>
              )}
            </Row>

            <SortRow
              sort={sortBy === 'profit' ? 'profit' : 'position'}
              onSortClick={() => {
                const newSort = sortBy === 'shares' ? 'profit' : 'shares'
                setSortBy(newSort)
                setPage(0)
                updateContractMetrics(newSort, currentAnswerId)
              }}
            />
          </Row>
          <BinaryUserPositionsTable
            loading={loading}
            contract={contract}
            positionsByShares={positionsToDisplay}
            positionsByProfit={profitPositionsToDisplay}
            totalYesPositions={totalYesPositions}
            totalNoPositions={totalNoPositions}
            sortBy={sortBy}
            page={page}
            setPage={setPage}
            loadingPositions={
              currentAnswerId && metricsCountsByAnswerId[currentAnswerId]
                ? // Just an approximation, could be more asymmetric
                  metricsCountsByAnswerId[currentAnswerId] / 2
                : Math.max(totalYesPositions, totalNoPositions)
            }
          />
        </Col>
      )
    }
    return null
  }
)

const BinaryUserPositionsTable = memo(
  function BinaryUserPositionsTabContent(props: {
    contract: CPMMContract | CPMMMultiContract
    positionsByShares: ContractMetric[] | undefined
    positionsByProfit: ContractMetric[] | undefined
    totalYesPositions: number
    totalNoPositions: number
    sortBy: 'profit' | 'shares'
    page: number
    setPage: (page: number) => void
    loading: boolean
    loadingPositions: number
  }) {
    const {
      contract,
      totalYesPositions,
      totalNoPositions,
      positionsByShares,
      positionsByProfit,
      sortBy,
      page,
      setPage,
      loading,
      loadingPositions,
    } = props
    const pageSize = 20
    const currentUser = useUser()
    const followedUsers = useFollows(currentUser?.id)

    const [leftColumnPositions, rightColumnPositions] = useMemo(
      () =>
        partition(
          sortBy === 'profit' ? positionsByProfit ?? [] : positionsByShares,
          (cm) => (sortBy === 'profit' ? cm.profit >= 0 : cm.hasYesShares)
        ),
      [
        JSON.stringify(positionsByProfit),
        JSON.stringify(positionsByShares),
        sortBy,
      ]
    )

    const visibleLeftPositions = leftColumnPositions.slice(
      page * pageSize,
      (page + 1) * pageSize
    )

    const visibleRightPositions = rightColumnPositions.slice(
      page * pageSize,
      (page + 1) * pageSize
    )

    const largestColumnLength =
      leftColumnPositions.length > rightColumnPositions.length
        ? leftColumnPositions.length
        : rightColumnPositions.length

    const isBinary =
      contract.outcomeType === 'BINARY' || contract.mechanism === 'cpmm-multi-1'
    const isStonk = contract.outcomeType === 'STONK'
    const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
    const mainBinaryMCAnswer = getMainBinaryMCAnswer(contract)
    const getPositionsTitle = (outcome: 'YES' | 'NO') => {
      return outcome === 'YES' ? (
        <span>
          {totalYesPositions}{' '}
          {mainBinaryMCAnswer ? (
            <OutcomeLabel
              contract={contract}
              outcome={outcome}
              truncate={'short'}
            />
          ) : isBinary ? (
            <>
              <YesLabel />
            </>
          ) : isStonk ? (
            <>
              <BuyLabel />
            </>
          ) : isPseudoNumeric ? (
            <>
              <HigherLabel />
            </>
          ) : (
            <></>
          )}
        </span>
      ) : (
        <span>
          {totalNoPositions}{' '}
          {mainBinaryMCAnswer ? (
            <OutcomeLabel
              contract={contract}
              outcome={outcome}
              truncate={'short'}
            />
          ) : isBinary ? (
            <>
              <NoLabel />
            </>
          ) : isStonk ? (
            <>
              <ShortLabel />
            </>
          ) : isPseudoNumeric ? (
            <>
              <LowerLabel />
            </>
          ) : (
            <></>
          )}{' '}
        </span>
      )
    }

    return (
      <>
        <Col
          className={clsx('w-full')}
          // To avoid the table height jumping when loading
          style={{
            minHeight: `${
              80 +
              (loadingPositions > pageSize ? pageSize : loadingPositions) * 57
            }px`,
          }}
        >
          {loading ? (
            <LoadingResults />
          ) : (
            <Row className={'gap-1'}>
              <Col className={'w-1/2'}>
                <Row className={'justify-between p-2'}>
                  {sortBy === 'profit' ? (
                    <span>Profit</span>
                  ) : (
                    <span>{getPositionsTitle('YES')}</span>
                  )}
                  {sortBy === 'shares' && (
                    <span className="text-ink-600">Max payout</span>
                  )}
                </Row>
                {visibleLeftPositions.map((position) => {
                  const outcome = 'YES'
                  return (
                    <PositionRow
                      key={position.userId + outcome}
                      position={position}
                      colorClassName={
                        isBinaryMulti(contract)
                          ? 'text-indigo-500'
                          : 'text-teal-500'
                      }
                      currentUser={currentUser}
                      followedUsers={followedUsers}
                      numberToShow={
                        sortBy === 'shares'
                          ? isStonk
                            ? getStonkDisplayShares(
                                contract,
                                position.totalShares[outcome] ?? 0,
                                2
                              ).toString()
                            : formatMoney(position.totalShares[outcome] ?? 0)
                          : formatMoney(position.profit)
                      }
                      invested={position.invested}
                    />
                  )
                })}
              </Col>
              <Col className={'w-1/2'}>
                <Row className={'justify-between p-2'}>
                  {sortBy === 'profit' ? (
                    <span>Loss</span>
                  ) : (
                    <span>{getPositionsTitle('NO')}</span>
                  )}
                  {sortBy === 'shares' && (
                    <span className="text-ink-600">Max payout</span>
                  )}
                </Row>
                {visibleRightPositions.map((position) => {
                  const outcome = 'NO'
                  return (
                    <PositionRow
                      key={position.userId + outcome}
                      position={position}
                      colorClassName={
                        isBinaryMulti(contract)
                          ? 'text-amber-600'
                          : 'text-scarlet-600'
                      }
                      currentUser={currentUser}
                      followedUsers={followedUsers}
                      numberToShow={
                        sortBy === 'shares'
                          ? isStonk
                            ? getStonkDisplayShares(
                                contract,
                                position.totalShares[outcome] ?? 0,
                                2
                              ).toString()
                            : formatMoney(position.totalShares[outcome] ?? 0)
                          : formatMoney(position.profit)
                      }
                      invested={position.invested}
                    />
                  )
                })}
              </Col>
            </Row>
          )}
        </Col>
        <Pagination
          page={page}
          pageSize={pageSize}
          totalItems={largestColumnLength}
          setPage={setPage}
        />
      </>
    )
  }
)
const PositionRow = memo(function PositionRow(props: {
  position: ContractMetric
  numberToShow: string
  invested: number
  currentUser: User | undefined | null
  followedUsers: string[] | undefined
  colorClassName: string
}) {
  const {
    position,
    colorClassName,
    currentUser,
    followedUsers,
    numberToShow,
    invested,
  } = props
  const { userId, userName, userUsername, userAvatarUrl } = position
  const isMobile = useIsMobile(800)

  return (
    <Row
      className={clsx(
        'border-ink-300 items-center justify-between gap-2 border-b px-2 py-3',
        currentUser?.id === position.userId && 'bg-amber-500/20',
        followedUsers?.includes(position.userId) && 'bg-blue-500/20'
      )}
    >
      <UserHovercard userId={userId}>
        <Row
          className={clsx(
            'max-w-[7rem] shrink items-center gap-2 overflow-hidden sm:max-w-none'
          )}
        >
          <Avatar
            size={'sm'}
            avatarUrl={userAvatarUrl}
            username={userUsername}
          />
          {userName && userUsername ? (
            <UserLink
              user={{ id: userId, name: userName, username: userUsername }}
              short={isMobile}
            />
          ) : (
            <span>Loading..</span>
          )}
        </Row>
      </UserHovercard>
      <Col>
        <span className={clsx(colorClassName, 'shrink-0', 'text-right')}>
          {numberToShow}
        </span>
        {invested > -99999999 && invested < 9999999999 && (
          <span
            className={clsx(
              'text-ink-500 hidden shrink-0 text-right text-xs sm:flex'
            )}
          >
            Spent {formatMoney(invested)}
          </span>
        )}
      </Col>
    </Row>
  )
})
const LoadingResults = () => {
  return (
    <Row className={'gap-1'}>
      <Col className={'w-1/2'}>
        <LoadingPositionsRows />
        <LoadingPositionsRows />
        <LoadingPositionsRows />
      </Col>
      <Col className={'w-1/2'}>
        <LoadingPositionsRows />
        <LoadingPositionsRows />
        <LoadingPositionsRows />
      </Col>
    </Row>
  )
}
export function LoadingPositionsRows() {
  return (
    <Row className="border-ink-200 min-h-[4rem] animate-pulse items-center justify-center gap-2 border-b p-2 last:border-none sm:rounded-md sm:border-none">
      <EmptyAvatar />
      <div className="bg-canvas-100 h-7 grow rounded-md" />
    </Row>
  )
}

function SortRow(props: { sort: string; onSortClick: () => void }) {
  const { sort, onSortClick } = props
  return (
    <Row className="items-center justify-end gap-4 whitespace-nowrap">
      <Row className="items-center gap-1">
        <span className="text-ink-400 text-sm">Sort by:</span>
        <button className="text-ink-600 w-20 text-sm" onClick={onSortClick}>
          <Row className="items-center gap-1">
            {sort}
            <TriangleDownFillIcon className=" h-2 w-2" />
          </Row>
        </button>
      </Row>
    </Row>
  )
}
