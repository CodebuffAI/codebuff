import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from 'common/contract'
import { User } from 'common/user'
import { getInvested } from 'common/calculate'
import { useState } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { OutcomeLabel } from '../outcome-label'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useSaveBinaryShares } from 'web/hooks/use-save-binary-shares'
import { Button } from '../buttons/button'
import clsx from 'clsx'
import { Bet } from 'common/bet'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { SellPanel } from './sell-panel'
import { TweetButton, getPositionTweet } from '../buttons/tweet-button'
import { getStonkDisplayShares } from 'common/stonk'

export function SellRow(props: {
  contract: CPMMContract
  user: User | null | undefined
  className?: string
  showTweet?: boolean
  hideStatus?: boolean
}) {
  const { className, contract, user, showTweet, hideStatus } = props
  const isStonk = contract.outcomeType === 'STONK'

  const userBets = useUserContractBets(user?.id, contract.id)
  const [showSellModal, setShowSellModal] = useState(false)

  const { mechanism } = contract
  const { sharesOutcome, shares } = useSaveBinaryShares(contract, userBets)

  if (sharesOutcome && user && mechanism === 'cpmm-1') {
    return (
      <Col className={className}>
        <Row className="items-center justify-between gap-4">
          {!hideStatus && (
            <div>
              {isStonk ? (
                <>
                  You have {getStonkDisplayShares(contract, shares, 2)} shares
                  of{' '}
                </>
              ) : (
                <>You'll get {formatMoney(shares)} on </>
              )}
              <OutcomeLabel
                outcome={sharesOutcome}
                contract={contract}
                truncate={'short'}
              />{' '}
            </div>
          )}

          <Button
            className="!py-1"
            size="xs"
            color="gray-outline"
            onClick={(e) => {
              setShowSellModal(true)
              // Necessary in the profile page to prevent the row from being toggled
              e.stopPropagation()
            }}
          >
            Sell
          </Button>
          {showSellModal && (
            <SellSharesModal
              contract={contract}
              user={user}
              userBets={userBets ?? []}
              shares={shares}
              sharesOutcome={sharesOutcome}
              setOpen={setShowSellModal}
            />
          )}

          {showTweet && userBets && (
            <TweetButton
              tweetText={getPositionTweet(
                (sharesOutcome === 'NO' ? -1 : 1) * shares,
                getInvested(contract, userBets),
                contract,
                user.username
              )}
            />
          )}
        </Row>
      </Col>
    )
  }

  return null
}

export function SellSharesModal(props: {
  className?: string
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract
  userBets: Bet[]
  shares: number
  sharesOutcome: 'YES' | 'NO'
  user: User
  setOpen: (open: boolean) => void
  answerId?: string
}) {
  const {
    className,
    contract,
    shares,
    sharesOutcome,
    userBets,
    user,
    setOpen,
    answerId,
  } = props
  const isStonk = contract.outcomeType === 'STONK'

  return (
    <Modal open={true} setOpen={setOpen}>
      <Col className={clsx('bg-canvas-0 rounded-md px-8 py-6', className)}>
        <Title>Sell position</Title>

        <div className="mb-6">
          {isStonk ? (
            <>You have {getStonkDisplayShares(contract, shares)} shares of </>
          ) : (
            <>
              You have {formatWithCommas(shares)} shares worth{' '}
              {formatMoney(shares)} if this {answerId ? 'answer' : 'question'}{' '}
              resolves{' '}
            </>
          )}
          <OutcomeLabel
            outcome={sharesOutcome}
            contract={contract}
            truncate={'short'}
            answerId={answerId}
          />
          .
        </div>

        <SellPanel
          contract={contract}
          shares={shares}
          sharesOutcome={sharesOutcome}
          user={user}
          userBets={userBets ?? []}
          onSellSuccess={() => setOpen(false)}
          answerId={answerId}
        />
      </Col>
    </Modal>
  )
}
