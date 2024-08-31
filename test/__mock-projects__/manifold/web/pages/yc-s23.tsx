import clsx from 'clsx'
import Link from 'next/link'
import { sortBy } from 'lodash'
import { useState } from 'react'
import { Answer } from 'common/answer'
import { CPMMMultiContract } from 'common/contract'
import { SimpleAnswerBars } from 'web/components/answers/answers-panel'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { linkClass } from 'web/components/widgets/site-link'
import { Title } from 'web/components/widgets/title'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { searchContracts } from 'web/lib/api/api'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { useContract } from 'web/hooks/use-contract'
import { capitalize } from 'lodash'
import { TRADE_TERM } from 'common/envs/constants'

type Company = {
  name: string
  slug: string
  valuation: number
  contractId: string
}

export async function getStaticProps() {
  const contracts = await searchContracts({
    term: '',
    // yc-s23
    topicSlug: 'yc-s23',
    // Manifold
    creatorId: 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2',
    limit: 1000,
  }).catch(() => [])

  const companies: Company[] = contracts
    .filter(
      (c) =>
        c.question.includes('Exit valuation of ') &&
        c.mechanism === 'cpmm-multi-1'
    )
    .map((contract) => {
      const name = contract.question
        .split('Exit valuation of ')[1]
        .split(' (YC S23)?')[0]
      const valuation = getValuation((contract as CPMMMultiContract).answers)
      return {
        name,
        valuation,
        slug: contract.slug,
        contractId: contract.id,
      }
    })

  return {
    props: {
      companies: sortBy(companies, (c) => -c.valuation),
    },
    revalidate: 60,
  }
}

export default function YCS23Page(props: { companies: Company[] }) {
  return (
    <Page trackPageView="YC S23">
      <Title className="!mb-2 px-4 pt-3 lg:px-0">YC S23</Title>
      <div className="mb-4 ml-4 lg:ml-0">
        {capitalize(TRADE_TERM)} on the exit valuation of each YC company
      </div>

      <Col className="bg-canvas-0 max-w-3xl pb-2">
        <Row className="bg-ink-100 justify-between px-3 py-2 font-semibold">
          <div className="pl-[54px]">Company</div>
          <div className="">Valuation</div>
        </Row>
        {props.companies.map((company, i) => (
          <CompanyRow
            key={company.contractId}
            company={company}
            index={i + 1}
          />
        ))}
      </Col>
    </Page>
  )
}

const CompanyRow = (props: { company: Company; index: number }) => {
  const { company, index } = props
  const { contractId, name, slug } = company
  const contract = useContract(contractId) as
    | CPMMMultiContract
    | null
    | undefined

  const answers = useAnswersCpmm(contractId)
  if (answers && contract) {
    contract.answers = answers
  }

  const valuation = answers ? getValuation(answers) : company.valuation
  const [expanded, setExpanded] = useState(false)

  return (
    <Col className="hover:bg-primary-100 active:bg-primary-100">
      <Link
        href={`/ManifoldMarkets/${slug}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Row className="cursor-pointer select-none justify-between px-3 py-2">
          <Row className="items-baseline gap-2">
            <div
              className="self-center"
              onClick={(e) => {
                e.preventDefault()
                setExpanded((b) => !b)
              }}
            >
              {expanded ? (
                <ChevronUpIcon className="text-ink-800 h-6 w-6" />
              ) : (
                <ChevronDownIcon className="text-ink-800 h-6 w-6" />
              )}
            </div>
            <div className="min-w-[32px] text-right font-mono">{index}</div>
            <div className={clsx('text-lg', linkClass)}>{name}</div>
          </Row>
          <div className="text-lg">${valuation}M</div>
        </Row>
      </Link>
      {expanded && (
        <Col className="border-ink-200 border-b px-3 pb-4 pt-2">
          {contract ? (
            <SimpleAnswerBars contract={contract} />
          ) : (
            <div>Loading...</div>
          )}
        </Col>
      )}
    </Col>
  )
}

const getValuation = (answers: Answer[]) => {
  const probs = answers.map((a) => a.prob)
  const valuation = Math.round(
    probs[1] * logMean(10, 100) +
      probs[2] * logMean(100, 1000) +
      probs[3] * logMean(1000, 2000)
  )
  return valuation
}
const logMean = (x: number, y: number) => (y - x) / (Math.log(y) - Math.log(x))
