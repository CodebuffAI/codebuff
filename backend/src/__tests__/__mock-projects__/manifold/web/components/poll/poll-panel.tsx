import { PollContract, contractPath } from 'common/contract'
import { PollOption } from 'common/poll-option'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { castPollVote } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { AnswerBar } from '../answers/answer-components'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { sumBy } from 'lodash'
import Link from 'next/link'
import { ArrowRightIcon, StarIcon } from '@heroicons/react/solid'
import { MODAL_CLASS, Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import clsx from 'clsx'
import { useOptionVoters } from 'web/hooks/use-votes'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { getUserVote } from 'web/lib/supabase/polls'
import { Tooltip } from '../widgets/tooltip'
import { UserHovercard } from '../user/user-hovercard'
import { maybePluralize } from 'common/util/format'

export function PollPanel(props: {
  contract: PollContract
  maxOptions?: number
  showResults?: boolean
}) {
  const { contract, maxOptions, showResults } = props
  const { options, closeTime } = contract
  const totalVotes = sumBy(options, (option) => option.votes)
  const votingOpen = !closeTime || closeTime > Date.now()
  const [hasVoted, setHasVoted] = useState<boolean | undefined>(undefined)
  const [userVotedId, setUserVotedId] = useState<string | undefined>(undefined)

  const user = useUser()
  useEffect(() => {
    if (!user) {
      setHasVoted(false)
      setUserVotedId(undefined)
    } else {
      getUserVote(contract.id, user?.id).then((result) => {
        if (!result) {
          setHasVoted(false)
          setUserVotedId(undefined)
        } else {
          setHasVoted(true)
          setUserVotedId(result)
        }
      })
    }
  }, [contract.id, user])

  const castVote = (voteId: string) => {
    if (!user) {
      firebaseLogin()
      return
    }
    setUserVotedId(voteId)
    castPollVote({ contractId: contract.id, voteId: voteId }).then(() => {
      setHasVoted(true)
    })
  }

  const optionsToShow = maxOptions ? options.slice(0, maxOptions) : options
  const isCreator = user?.id === contract.creatorId

  return (
    <Col className="text-ink-1000 gap-2">
      {optionsToShow.map((option: PollOption) => {
        const prob = option.votes === 0 ? 0 : option.votes / totalVotes

        return (
          <AnswerBar
            key={option.id}
            color={'#818cf8'} // indigo-400
            prob={prob}
            resolvedProb={
              contract.isResolved &&
              contract.resolutions?.some((s) => s == option.id)
                ? 1
                : undefined
            }
            label={<div>{option.text}</div>}
            end={
              <Row className="gap-3">
                {(hasVoted || !votingOpen || isCreator) && (
                  <SeeVotesButton
                    option={option}
                    contractId={contract.id}
                    userVotedId={userVotedId}
                  />
                )}
                {!hasVoted && votingOpen && (
                  <VoteButton
                    loading={!!userVotedId && userVotedId === option.id}
                    onClick={() => castVote(option.id)}
                    disabled={!!userVotedId}
                  />
                )}
              </Row>
            }
            hideBar={
              !showResults &&
              !hasVoted &&
              !!closeTime &&
              closeTime > Date.now() &&
              !isCreator
            }
            className={'min-h-[40px]'}
          />
        )
      })}
      {optionsToShow.length < options.length && (
        <Link
          className="text-ink-500 hover:text-primary-500"
          href={contractPath(contract)}
        >
          See {options.length - optionsToShow.length} more options{' '}
          <ArrowRightIcon className="inline h-4 w-4" />
        </Link>
      )}
    </Col>
  )
}

export function SeeVotesButton(props: {
  option: PollOption
  contractId: string
  userVotedId?: string
}) {
  const { option, contractId, userVotedId } = props
  const [open, setOpen] = useState(false)
  const disabled = option.votes === 0
  return (
    <>
      {option.id == userVotedId && (
        <Tooltip text="You voted">
          <StarIcon className="h-4 w-4" />
        </Tooltip>
      )}
      <button
        className="disabled:text-ink-900/60 disabled:pointer-none hover:text-primary-700 group whitespace-nowrap transition-colors disabled:cursor-not-allowed"
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
        disabled={disabled}
      >
        <span>{option.votes}</span>{' '}
        <span className={clsx('text-xs opacity-80')}>
          {maybePluralize('vote', option.votes)}
        </span>
      </button>
      <Modal open={open} setOpen={setOpen}>
        <SeeVotesModalContent option={option} contractId={contractId} />
      </Modal>
    </>
  )
}

export function SeeVotesModalContent(props: {
  option: PollOption
  contractId: string
}) {
  const { option, contractId } = props
  const voters = useOptionVoters(contractId, option.id)
  return (
    <Col className={clsx(MODAL_CLASS)}>
      <div className="line-clamp-2 w-full">
        Votes on <b>{option.text}</b>
      </div>
      {/* <Spacer h={2} /> */}
      <Col className={clsx(SCROLLABLE_MODAL_CLASS, 'w-full gap-2')}>
        {!voters ? (
          <LoadingIndicator />
        ) : voters.length == 0 ? (
          'No votes yet...'
        ) : (
          voters.map((voter) => {
            return (
              <UserHovercard userId={voter.id} key={voter.id}>
                <Row className="w-full items-center gap-2">
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
    </Col>
  )
}

export function VoteButton(props: {
  loading: boolean
  onClick: () => void
  disabled: boolean
}) {
  const { loading, onClick, disabled } = props
  return (
    <Button
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
      size="2xs"
      loading={loading}
      color="indigo-outline"
      className="!ring-1"
      disabled={disabled}
    >
      Vote
    </Button>
  )
}
