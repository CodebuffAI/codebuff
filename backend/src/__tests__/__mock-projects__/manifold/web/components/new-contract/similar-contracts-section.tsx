import { Contract, CreateableOutcomeType } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { IconButton } from 'web/components/buttons/button'
import { XIcon } from '@heroicons/react/outline'
import { ContractMention } from 'web/components/contract/contract-mention'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
const DUPES_TO_SHOW = 3

export const SimilarContractsSection = (props: {
  similarContracts: Contract[]
  setSimilarContracts: (c: Contract[]) => void
  setDismissedSimilarContractTitles: (
    func: (titles: string[]) => string[]
  ) => void
  outcomeType: CreateableOutcomeType
  question: string
}) => {
  const {
    similarContracts,
    outcomeType,
    question,
    setSimilarContracts,
    setDismissedSimilarContractTitles,
  } = props

  return (
    <Col className={'space-y-1 '}>
      <Row className={'justify-between px-1'}>
        <Link
          className={linkClass}
          href={'/browse?q=' + encodeURIComponent(question)}
        >
          {similarContracts.length > DUPES_TO_SHOW
            ? `${DUPES_TO_SHOW}+`
            : similarContracts.length}{' '}
          Existing {outcomeType == 'POLL' ? 'poll(s)' : 'question(s)'}
        </Link>
        <IconButton
          size={'2xs'}
          onClick={() => {
            setSimilarContracts([])
            setDismissedSimilarContractTitles((titles) =>
              titles.concat(question.toLowerCase().trim())
            )
          }}
        >
          <XIcon className="text-ink-500 h-4 w-4" />
        </IconButton>
      </Row>
      {similarContracts.slice(0, DUPES_TO_SHOW).map((contract) => (
        <Row key={contract.id} className="text-ink-700 pl-1 text-sm">
          <ContractMention contract={contract} />
        </Row>
      ))}
    </Col>
  )
}
