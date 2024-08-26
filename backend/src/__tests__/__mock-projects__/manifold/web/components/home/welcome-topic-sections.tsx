import { Col } from 'web/components/layout/col'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Row } from 'web/components/layout/row'
import { linkClass } from 'web/components/widgets/site-link'
import { Topic } from 'common/group'
import Link from 'next/link'
import { removeEmojis } from 'common/util/string'
import { ArrowRightIcon } from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
import { Contract } from 'common/contract'

export const WelcomeTopicSections = (props: {
  memberTopicsWithContracts: { topic: Topic; contracts: Contract[] }[]
}) => {
  const { memberTopicsWithContracts } = props
  if (!memberTopicsWithContracts.length) return null
  return (
    <Col className={'mt-1 w-full gap-2'}>
      {memberTopicsWithContracts.map((topicWithContracts) => {
        const { topic, contracts } = topicWithContracts
        return (
          <Col key={topic.id} className={'mb-5 gap-2'}>
            <Row className={'text-primary-700 mx-1 mb-2 text-3xl'}>
              <Link className={linkClass} href={`/browse/${topic.slug}`}>
                {topic.name} questions
              </Link>
            </Row>
            {contracts.map((contract) => (
              <FeedContractCard
                key={contract.id}
                contract={contract}
                trackingPostfix={'welcome topic section'}
                className={'mb-2'}
              />
            ))}
            <Row
              className={
                'text-ink-700 mx-1 -mt-1 items-center justify-end text-lg'
              }
            >
              <Link className={linkClass} href={`/browse/${topic.slug}`}>
                <Row className={'items-center gap-1'}>
                  See more {removeEmojis(topic.name)} questions
                  <ArrowRightIcon className="h-4 w-4 shrink-0" />
                </Row>
              </Link>
            </Row>
          </Col>
        )
      })}
      <Row className={'justify-center'}>
        <Link className={linkClass} href={`/browse?fy=1&f=open`}>
          <Button color={'indigo-outline'} className={'mx-2 mb-8 mt-2 text-xl'}>
            <Row className={'items-center justify-center gap-2'}>
              Explore all questions by topic
              <ArrowRightIcon className="h-4 w-4 shrink-0" />
            </Row>
          </Button>
        </Link>
      </Row>
    </Col>
  )
}
