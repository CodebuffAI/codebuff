import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { PLURAL_BETS, User } from 'common/user'
import { ENV_CONFIG, TRADE_TERM } from 'common/envs/constants'
import { LOAN_DAILY_RATE, overLeveraged } from 'common/loans'
import { useHasReceivedLoanToday } from 'web/hooks/use-has-received-loan'
import { useIsEligibleForLoans } from 'web/hooks/use-is-eligible-for-loans'

export function LoansModal(props: {
  user: User
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { isOpen, user, setOpen } = props
  const { receivedLoanToday } = useHasReceivedLoanToday(user)
  const { latestPortfolio, isEligible } = useIsEligibleForLoans(user?.id)

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="bg-canvas-0 text-ink-1000 items-center gap-4 rounded-md px-8 py-6">
        <span className={'text-8xl'}>🏦</span>
        <span className="text-xl">Daily loans on your {PLURAL_BETS}</span>
        {receivedLoanToday ? (
          <span className={'text-ink-600 text-sm italic'}>
            You have already received your loan today. Come back tomorrow for
            {user.nextLoanCached > 0 &&
              ` ${ENV_CONFIG.moneyMoniker}${Math.floor(user.nextLoanCached)}!`}
          </span>
        ) : !isEligible || user.nextLoanCached < 1 ? (
          <span className={'text-ink-600 text-sm italic'}>
            You're not eligible for a loan right now.{' '}
            {!user?.lastBetTime || !latestPortfolio
              ? `Make your first ${TRADE_TERM} and come back in an hour to become eligible.`
              : latestPortfolio.investmentValue <= 0
              ? `Your investment value is at or below 0. Place some ${TRADE_TERM}s to become eligible.`
              : overLeveraged(
                  latestPortfolio.loanTotal,
                  latestPortfolio.investmentValue
                )
              ? `You are over-leveraged. Sell some of your positions or place some good ${TRADE_TERM}s to become eligible.`
              : latestPortfolio.loanTotal && user.nextLoanCached < 1
              ? `We've already loaned you up to the current value of your ${TRADE_TERM}s. Place some more ${TRADE_TERM}s to become eligible again.`
              : ''}
          </span>
        ) : null}
        <Col className={'gap-2'}>
          <span className={'text-primary-700'}>• What are loans?</span>
          <span className={'ml-2'}>
            When you {TRADE_TERM} on long-term markets, your funds (mana) are
            tied up until the outcome is determined, which could take years. To
            let you continue to place {TRADE_TERM}s, we offer a unique solution:
            0% interest loans. Each day, you're eligible to receive a loan
            amounting to {LOAN_DAILY_RATE * 100}% of your total {TRADE_TERM}{' '}
            value. If the value of your {TRADE_TERM} decreases, the loan amount
            will be {LOAN_DAILY_RATE * 100}% of the current, lower value.
          </span>
          <span className={'text-primary-700'}>
            • Do I have to pay back a loan?
          </span>
          <span className={'ml-2'}>
            Yes, but don't worry! You will automatically pay back loans when the
            question resolves or you sell your {TRADE_TERM}.
          </span>
          <span className={'text-primary-700'}>
            • What is the purpose of loans?
          </span>
          <span className={'ml-2'}>
            Loans make it worthwhile to {TRADE_TERM} on questions that won't
            resolve for months or years, because your investment won't be locked
            up as long.
          </span>
          <span className={'text-primary-700'}>• What is an example?</span>
          <span className={'ml-2'}>
            For example, if you {TRADE_TERM} {ENV_CONFIG.moneyMoniker}1000 on
            "Will I become a millionaire?", you will get{' '}
            {ENV_CONFIG.moneyMoniker}
            {LOAN_DAILY_RATE * 1000} back tomorrow.
          </span>
          <span className={'ml-2'}>
            Previous loans count against your total invested amount. So on the
            next day, you would get back {LOAN_DAILY_RATE * 100}% of{' '}
            {ENV_CONFIG.moneyMoniker}(1000 - {LOAN_DAILY_RATE * 1000}) =
            {ENV_CONFIG.moneyMoniker}
            {LOAN_DAILY_RATE * (1000 - LOAN_DAILY_RATE * 1000)}.
          </span>
        </Col>
      </Col>
    </Modal>
  )
}
