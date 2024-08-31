import { Answer } from 'common/answer'
import { CPMMMultiContract, CPMMNumericContract } from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { formatPercent } from 'common/util/format'
import { BuyPanel } from '../bet/bet-panel'

export function AnswerCpmmBetPanel(props: {
  answer: Answer
  contract: CPMMMultiContract | CPMMNumericContract
  closePanel: () => void
  outcome: 'YES' | 'NO' | undefined
  alwaysShowOutcomeSwitcher?: boolean
  feedReason?: string
}) {
  const {
    answer,
    contract,
    closePanel,
    outcome,
    feedReason,
    alwaysShowOutcomeSwitcher,
  } = props

  return (
    <Col className="bg-canvas-0 rounded-2xl">
      <BuyPanel
        contract={contract}
        multiProps={{
          answers: contract.answers,
          answerToBuy: answer,
        }}
        initialOutcome={outcome}
        // singularView={outcome}
        onBuySuccess={() => setTimeout(closePanel, 500)}
        location={'contract page answer'}
        feedReason={feedReason}
        inModal={true}
        alwaysShowOutcomeSwitcher={alwaysShowOutcomeSwitcher}
      >
        <Row className="text-ink-900 mb-6 justify-between text-lg">
          <h1>{answer.text}</h1>
          <div className="font-semibold">{formatPercent(answer.prob)}</div>
        </Row>
      </BuyPanel>
    </Col>
  )
}
