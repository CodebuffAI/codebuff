import clsx from 'clsx'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getContractBetMetrics } from 'common/calculate'
import { CPMMMultiContract } from 'common/contract'
import { User } from 'common/user'
import { useState } from 'react'
import { SellSharesModal } from 'web/components/bet/sell-row'
import { Row } from 'web/components/layout/row'
import { sumBy } from 'lodash'
import { FaArrowDown, FaArrowUp } from 'react-icons/fa'
import { TRADED_TERM } from 'common/envs/constants'

export function UserPosition(props: {
  contract: CPMMMultiContract
  userBets: Bet[]
  answer: Answer
  user: User
  className?: string
  greenArrowClassName?: string
  redArrowClassName?: string
}) {
  const {
    contract,
    user,
    userBets,
    answer,
    className,
    greenArrowClassName,
    redArrowClassName,
  } = props

  const { totalShares } = getContractBetMetrics(contract, userBets)

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0
  const position = yesWinnings - noWinnings
  const betUp = position > 1e-7
  const betDown = position < 1e-7
  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const [openModal, setOpenModal] = useState(false)
  if (!betUp && !betDown) {
    return <></>
  }

  return (
    <button
      className={clsx(className)}
      onClick={(e) => {
        e.stopPropagation()
        if (
          (!contract.closeTime || contract.closeTime > Date.now()) &&
          !answer.resolutionTime
        ) {
          setOpenModal(true)
        }
      }}
    >
      <Row className="mx-auto items-center gap-1">
        {betUp ? (
          <FaArrowUp
            className={clsx(
              'h-3 w-3 text-teal-400 dark:text-teal-600',
              greenArrowClassName
            )}
          />
        ) : (
          <FaArrowDown
            className={clsx(
              'text-scarlet-400 dark:text-scarlet-600 h-3 w-3',
              redArrowClassName
            )}
          />
        )}
        You {TRADED_TERM} {betUp ? 'up' : 'down'}
      </Row>
      {openModal && (
        <>
          <SellSharesModal
            contract={contract}
            user={user}
            userBets={userBets}
            shares={Math.abs(sharesSum)}
            sharesOutcome={sharesSum > 0 ? 'YES' : 'NO'}
            setOpen={setOpenModal}
            answerId={answer.id}
          />
        </>
      )}
    </button>
  )
}
