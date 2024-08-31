import { UserIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract, BinaryContract } from 'common/contract'
import { useState } from 'react'
import { useBetsOnce } from 'web/hooks/use-bets'
import { MODAL_CLASS, Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Tooltip } from '../widgets/tooltip'
import { BetsTabContent } from './contract-tabs'
import { UserPositionsTable } from 'web/components/contract/user-positions-table'
import { UncontrolledTabs } from 'web/components/layout/tabs'
import { Col } from 'web/components/layout/col'
import { useContractVoters } from 'web/hooks/use-votes'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { track } from 'web/lib/service/analytics'
import { Answer } from 'common/answer'
import { useUniqueBettorCountOnAnswer } from 'web/hooks/use-answers'
import { Button, ColorType } from 'web/components/buttons/button'
import { UserHovercard } from '../user/user-hovercard'
import { useBountyAwardCount } from 'web/hooks/use-bounties'
import { FaUser } from 'react-icons/fa6'
import { shortenNumber } from 'web/lib/util/formatNumber'

export function TradesButton(props: {
  contract: Contract
  answer?: Answer
  className?: string
  color?: ColorType
  size?: 'sm' | 'md'
}) {
  const { contract, color, answer, className, size } = props

  const [modalOpen, setModalOpen] = useState<boolean>(false)

  const isPoll = contract.outcomeType === 'POLL'
  const isBounty = contract.outcomeType === 'BOUNTIED_QUESTION'

  const tooltipText = isPoll ? 'Voters' : isBounty ? 'Rewards given' : 'Traders'

  return (
    <>
      {!size || size == 'md' ? (
        <Button
          size={'2xs'}
          color={color ?? 'gray-white'}
          className={clsx(className)}
          onClick={(e) => {
            track('click feed card traders button', {
              contractId: contract.id,
            })
            e.preventDefault()
            setModalOpen(true)
          }}
        >
          <Tooltip text={tooltipText} placement="top" noTap>
            <Row className="relative items-center gap-1.5 text-sm">
              <UserIcon className="h-5 w-5" />
              <TradesNumber contract={contract} answer={answer} />
            </Row>
          </Tooltip>
        </Button>
      ) : (
        <button
          className={clsx(className)}
          onClick={(e) => {
            track('click answer traders button', {
              contractId: contract.id,
            })
            e.preventDefault()
            setModalOpen(true)
          }}
        >
          <Tooltip text={tooltipText} placement="bottom" noTap>
            <Row className="relative items-center gap-0.5">
              <FaUser className=" h-2.5 w-2.5" />
              <TradesNumber contract={contract} answer={answer} />
            </Row>
          </Tooltip>
        </button>
      )}
      <TradesModal
        contract={contract}
        modalOpen={modalOpen}
        setModalOpen={setModalOpen}
        answer={answer}
      />
    </>
  )
}

export function TradesNumber(props: {
  contract: Contract
  answer?: Answer
  shorten?: boolean
}) {
  const { contract, answer, shorten } = props

  const isBounty = contract.outcomeType === 'BOUNTIED_QUESTION'

  const { uniqueBettorCount: uniqueTraders } = contract
  const uniqueAnswerBettorCount = useUniqueBettorCountOnAnswer(
    contract.id,
    answer?.id
  )
  const uniqueBountyRewardCount = useBountyAwardCount(contract)
  const tradesNumber = isBounty
    ? uniqueBountyRewardCount
    : answer
    ? uniqueAnswerBettorCount
    : uniqueTraders || ''
  if (shorten) {
    return <>{shortenNumber(+tradesNumber)}</>
  }
  return <>{tradesNumber}</>
}

export function TradesModal(props: {
  contract: Contract
  modalOpen: boolean
  answer?: Answer
  setModalOpen: (open: boolean) => void
}) {
  const { contract, modalOpen, setModalOpen, answer } = props

  const isPoll = contract.outcomeType === 'POLL'

  const uniqueAnswerBettorCount = useUniqueBettorCountOnAnswer(
    contract.id,
    answer?.id
  )

  return (
    <Modal
      open={modalOpen}
      setOpen={setModalOpen}
      className={clsx(MODAL_CLASS)}
      size={'lg'}
    >
      {modalOpen && (
        <div className={clsx(SCROLLABLE_MODAL_CLASS, 'scrollbar-hide')}>
          {isPoll ? (
            <VotesModalContent contract={contract} />
          ) : (
            <BetsModalContent
              contract={contract}
              answerDetails={
                answer
                  ? {
                      answer,
                      totalPositions: uniqueAnswerBettorCount,
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}
    </Modal>
  )
}

function VotesModalContent(props: { contract: Contract }) {
  const { contract } = props
  const voters = useContractVoters(contract.id)

  return (
    <Col className="mt-4 gap-3">
      {!voters ? (
        <LoadingIndicator />
      ) : voters.length == 0 ? (
        'No votes yet...'
      ) : (
        voters.map((voter) => {
          return (
            <UserHovercard userId={voter.id} key={voter.id}>
              <Row className="items-center gap-2">
                <Avatar
                  username={voter.username}
                  avatarUrl={voter.avatarUrl}
                  size={'sm'}
                />
                <UserLink user={voter} />
              </Row>
            </UserHovercard>
          )
        })
      )}
    </Col>
  )
}

function BetsModalContent(props: {
  contract: Contract
  answerDetails?: {
    answer: Answer
    totalPositions: number
  }
}) {
  const { contract, answerDetails } = props
  const answer = answerDetails?.answer
  const bets = useBetsOnce({
    contractId: contract.id,
    answerId: answer?.id,
    filterRedemptions: true,
  })

  return (
    <UncontrolledTabs
      tabs={[
        {
          title: 'Holders',
          content: (
            <UserPositionsTable
              contract={contract as BinaryContract}
              answerDetails={answerDetails}
            />
          ),
        },
        {
          title: 'Recent Trades',
          content: !bets ? (
            <LoadingIndicator />
          ) : (
            <Col className={'mt-2'}>
              <BetsTabContent
                contract={contract}
                bets={bets}
                totalBets={bets.length}
              />
            </Col>
          ),
        },
      ]}
    />
  )
}
