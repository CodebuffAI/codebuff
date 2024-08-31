import clsx from 'clsx'

import {
  contractPath,
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  isBinaryMulti,
} from 'common/contract'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { BuyPanel } from './bet-panel'
import { Subtitle } from '../widgets/subtitle'
import { getDefaultSort, MultiSort } from 'common/answer'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { AnswersPanel } from 'web/components/answers/answers-panel'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { BinaryMultiAnswersPanel } from 'web/components/answers/binary-multi-answers-panel'
import { NumericBetPanel } from 'web/components/answers/numeric-bet-panel'
import { Row } from 'web/components/layout/row'
import { MultiNumericResolutionOrExpectation } from 'web/components/contract/contract-price'

export function BetDialog(props: {
  contract: BinaryContract
  open: boolean
  setOpen: (open: boolean) => void
  trackingLocation: string
}) {
  const { contract, open, setOpen, trackingLocation } = props
  const { question } = contract

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={clsx(
        MODAL_CLASS,
        'pointer-events-auto max-h-[32rem] overflow-auto'
      )}
    >
      <Col>
        <Subtitle className="!mb-4 !mt-0 !text-xl">{question}</Subtitle>
        <BuyPanel
          contract={contract}
          onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
          location={trackingLocation}
          inModal={true}
          initialOutcome="YES"
          alwaysShowOutcomeSwitcher
        />
      </Col>
    </Modal>
  )
}

export function MultiBetDialog(props: {
  contract: CPMMMultiContract | CPMMNumericContract
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, open, setOpen } = props
  const { question } = contract
  const [query, setQuery] = usePersistentInMemoryState(
    '',
    'create-answer-text' + contract.id
  )
  const defaultSort = getDefaultSort(contract)

  const [sort, setSort] = usePersistentInMemoryState<MultiSort>(
    defaultSort,
    'answer-sort' + contract.id
  )

  const isBinaryMC = isBinaryMulti(contract)
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      size={'lg'}
      className={clsx(
        MODAL_CLASS,
        'pointer-events-auto max-h-[32rem] overflow-auto'
      )}
    >
      <Col>
        {contract.outcomeType === 'NUMBER' ? (
          <NumericBetDialog contract={contract as CPMMNumericContract} />
        ) : (
          <>
            <Link
              href={contractPath(contract)}
              className={clsx('text-primary-700 text-xl', linkClass)}
            >
              {question}
            </Link>
            {isBinaryMC ? (
              <BinaryMultiAnswersPanel
                contract={contract as CPMMMultiContract}
              />
            ) : (
              <AnswersPanel
                contract={contract}
                selectedAnswerIds={[]}
                sort={sort}
                setSort={setSort}
                query={query}
                setQuery={setQuery}
                onAnswerHover={() => null}
                onAnswerClick={() => null}
                defaultAddAnswer={contract.addAnswersMode === 'ANYONE'}
                floatingSearchClassName={'-top-8 pt-4'}
              />
            )}
          </>
        )}
      </Col>
    </Modal>
  )
}

const NumericBetDialog = (props: { contract: CPMMNumericContract }) => {
  const { contract } = props
  const { question } = contract
  return (
    <Col>
      <Row className={'mb-2 justify-between'}>
        <Link
          href={contractPath(contract)}
          className={clsx('mb-4 text-xl text-indigo-700', linkClass)}
        >
          {question}
        </Link>
        <MultiNumericResolutionOrExpectation contract={contract} />
      </Row>
      <NumericBetPanel contract={contract} />
    </Col>
  )
}
