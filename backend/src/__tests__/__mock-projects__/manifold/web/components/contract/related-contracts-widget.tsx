import clsx from 'clsx'
import Link from 'next/link'
import { memo, useState } from 'react'

import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { ContractStatusLabel } from './contracts-table'
import { Contract, contractPath, BinaryContract } from 'common/contract'
import Masonry from 'react-masonry-css'
import { Button } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { Topic } from 'common/group'
import { FeedBinaryChart } from 'web/components/feed/feed-chart'
import { UserHovercard } from '../user/user-hovercard'

export const SidebarRelatedContractsList = memo(function (props: {
  contracts: Contract[]
  loadMore?: () => Promise<boolean>
  topics?: Topic[]
  className?: string
}) {
  const { contracts, loadMore, className } = props

  return (
    <Col className={clsx(className, 'flex-1')}>
      <h2 className="text-ink-600 mb-2 text-xl">Related questions</h2>
      <Col className="divide-ink-300 divide-y-[0.5px]">
        {contracts.map((contract) => (
          <SidebarRelatedContractCard
            contract={contract}
            key={contract.id}
            onContractClick={(c) =>
              track('click related market', {
                contractId: c.id,
                variant: 'non-grouped',
              })
            }
          />
        ))}
      </Col>
      {contracts.length > 0 && loadMore && (
        <LoadMoreUntilNotVisible loadMore={loadMore} />
      )}
    </Col>
  )
})

export const RelatedContractsGrid = memo(function (props: {
  contracts: Contract[]
  loadMore?: () => Promise<boolean>
  className?: string
  showAll?: boolean
  showOnlyAfterBet?: boolean
  justBet?: boolean
}) {
  const { contracts, loadMore, className, showAll, showOnlyAfterBet, justBet } =
    props

  const [showMore, setShowMore] = useState(showAll ?? false)
  const titleClass = 'text-ink-600 mb-2 text-xl'

  return (
    <Col
      className={clsx(
        className,
        'bg-canvas-50 -mx-4 flex-1 px-4 pt-6 lg:-mx-8 xl:hidden',
        !justBet && showOnlyAfterBet ? 'hidden' : ''
      )}
    >
      <h2 className={clsx(titleClass)}>Related questions</h2>
      <Col
        className={clsx(
          showMore
            ? 'scrollbar-hide overflow-y-auto scroll-smooth'
            : 'overflow-hidden',
          showAll ? 'h-full' : showMore ? 'h-[40rem]' : 'h-64'
        )}
      >
        <Masonry
          breakpointCols={{ default: 2, 768: 1 }}
          className={clsx('flex w-auto snap-x gap-2')}
        >
          {contracts.map((contract) => (
            <RelatedContractCard
              key={contract.id}
              showGraph={showAll}
              contract={contract}
              onContractClick={(c) =>
                track('click related market', { contractId: c.id })
              }
              twoLines
            />
          ))}
        </Masonry>
        {loadMore && showMore && (
          <LoadMoreUntilNotVisible loadMore={loadMore} />
        )}
      </Col>
      {!showAll && (
        <Button
          color={'gray-white'}
          onClick={() => setShowMore(!showMore)}
          className="!rounded-none !py-4"
        >
          {showMore ? (
            <ChevronUpIcon className="mr-1 h-4 w-4" />
          ) : (
            <ChevronDownIcon className="mr-1 h-4 w-4" />
          )}
          {showMore ? 'Show less' : 'Show more'}
        </Button>
      )}
    </Col>
  )
})

const SidebarRelatedContractCard = memo(function (props: {
  contract: Contract
  onContractClick?: (contract: Contract) => void
  twoLines?: boolean
  className?: string
}) {
  const { contract, onContractClick, twoLines, className } = props

  const {
    creatorUsername,
    creatorAvatarUrl,
    question,
    creatorCreatedTime,
    creatorId,
  } = contract

  return (
    <Link
      className={clsx(
        'whitespace-nowrap outline-none',
        'bg-canvas-0 lg:hover:bg-primary-50 focus:bg-primary-50 transition-colors',
        'px-4 py-3',
        className
      )}
      href={contractPath(contract)}
      onClick={() => onContractClick?.(contract)}
    >
      <div
        className={clsx(
          'break-anywhere mb-2 whitespace-normal font-medium',
          twoLines ? 'line-clamp-2' : 'line-clamp-3'
        )}
      >
        {question}
      </div>
      <Row className="w-full items-end justify-between">
        <UserHovercard userId={creatorId}>
          <Row className="items-center gap-1.5">
            <Avatar
              username={creatorUsername}
              avatarUrl={creatorAvatarUrl}
              size="xs"
              noLink
            />
            <UserLink
              user={{
                id: contract.creatorId,
                name: contract.creatorName,
                username: contract.creatorUsername,
              }}
              className="text-ink-500 text-sm"
              createdTime={creatorCreatedTime}
              noLink
            />
          </Row>
        </UserHovercard>

        <ContractStatusLabel
          contract={contract}
          chanceLabel
          className="font-semibold"
        />
      </Row>
    </Link>
  )
})

const RelatedContractCard = memo(function (props: {
  contract: Contract
  onContractClick?: (contract: Contract) => void
  twoLines?: boolean
  showGraph?: boolean
  className?: string
}) {
  const { contract, onContractClick, showGraph, twoLines, className } = props
  const {
    creatorUsername,
    creatorAvatarUrl,
    question,
    creatorCreatedTime,
    creatorId,
  } = contract
  const probChange =
    contract.outcomeType === 'BINARY' &&
    showGraph &&
    'probChanges' in contract &&
    Math.abs((contract as BinaryContract).probChanges.day) > 0.03
      ? (contract as BinaryContract).probChanges.day
      : 0

  return (
    <Link
      className={clsx(
        'whitespace-nowrap outline-none',
        'bg-canvas-0 lg:hover:bg-primary-50 focus:bg-primary-50 transition-colors',
        'border-ink-300 my-2 flex flex-col rounded-lg border-2 p-2',
        className
      )}
      href={contractPath(contract)}
      onClick={() => onContractClick?.(contract)}
    >
      <div
        className={clsx(
          'break-anywhere mb-2 whitespace-normal font-medium',
          twoLines ? 'line-clamp-2' : 'line-clamp-3'
        )}
      >
        {question}
      </div>
      <Row className="w-full items-end justify-between">
        <UserHovercard userId={creatorId}>
          <Row className="items-center gap-1.5">
            <Avatar
              username={creatorUsername}
              avatarUrl={creatorAvatarUrl}
              size="xs"
              noLink
            />
            <UserLink
              user={{
                id: contract.creatorId,
                name: contract.creatorName,
                username: contract.creatorUsername,
              }}
              className="text-ink-500 text-sm"
              createdTime={creatorCreatedTime}
              noLink
            />
          </Row>
        </UserHovercard>

        <Row className={'items-baseline gap-1'}>
          {contract.outcomeType === 'BINARY' && probChange !== 0 && (
            <span
              className={clsx(
                'mr-1 text-sm',
                probChange > 0 ? 'text-green-500' : 'text-red-500'
              )}
            >
              {probChange > 0 ? '+' : ''}
              {Math.round(probChange * 100)}% 1d
            </span>
          )}
          <ContractStatusLabel
            contract={contract}
            className="font-semibold"
            chanceLabel
          />
        </Row>
      </Row>
      {contract.outcomeType === 'BINARY' && probChange !== 0 && (
        <FeedBinaryChart contract={contract} className="my-4" />
      )}
    </Link>
  )
})
