import clsx from 'clsx'
import { Col } from './layout/col'
import { ChevronDoubleDownIcon } from '@heroicons/react/solid'
import { Card } from './widgets/card'
import React from 'react'
import { Row } from './layout/row'
import { FaHandHoldingUsd, FaPercentage } from 'react-icons/fa'
import { TbTargetArrow } from 'react-icons/tb'
import { track } from 'web/lib/service/analytics'
import {
  SPICE_PRODUCTION_ENABLED,
  TRADE_TERM,
  TRADING_TERM,
} from 'common/envs/constants'
import { capitalize } from 'lodash'

export const ExplainerPanel = (props: {
  className?: string
  showWhatIsManifold?: boolean
  showAccuracy?: boolean
  showWhyBet?: boolean
}) => {
  const {
    className,
    showWhatIsManifold = true,
    showAccuracy = true,
    showWhyBet = true,
  } = props
  const handleSectionClick = (sectionTitle: string) => {
    track('explainer section click', { sectionTitle })
  }
  return (
    <Col className={clsx(className)}>
      {showWhatIsManifold && <WhatIsManifold onClick={handleSectionClick} />}
      {showAccuracy && <Accuracy onClick={handleSectionClick} />}
      {showWhyBet && <WhyBet onClick={handleSectionClick} />}
    </Col>
  )
}

export const ExpandSection = (props: {
  title: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
}) => {
  const { title, children, onClick } = props

  return (
    <Card className="my-2">
      <details className="group flex flex-col gap-2">
        <summary className="flex list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <Row className="items-center text-lg font-semibold">{title}</Row>
          <span className="ml-auto inline-block h-4 w-4 flex-shrink-0">
            <ChevronDoubleDownIcon
              className="h-full w-full transition group-open:-rotate-180"
              aria-hidden
              onClick={onClick}
            />
          </span>
        </summary>
        <div className="text-ink-900 px-4 pb-3">{children}</div>
      </details>
    </Card>
  )
}

const WhatIsManifold = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <Row className="items-start">
        <FaPercentage className="mr-2 mt-[0.25em] flex-shrink-0 align-text-bottom" />{' '}
        What is Manifold?
      </Row>
    }
    onClick={() => onClick('What is Manifold?')}
  >
    <div className="pb-2">
      Manifold lets you {TRADE_TERM} on upcoming events using play money. As
      other users {TRADE_TERM} against you, it creates a probability of how
      likely the event will happen—this is known as a prediction market.
    </div>
    <div className="pb-2">
      {capitalize(TRADE_TERM)} on current events, politics, tech, and AI, or
      create your own market about an event you care about for others to trade
      on!
    </div>
  </ExpandSection>
)

const WhyBet = ({ onClick }: { onClick: (sectionTitle: string) => void }) => (
  <ExpandSection
    title={
      <>
        <FaHandHoldingUsd className="mr-2" /> Why should I {TRADE_TERM}?
      </>
    }
    onClick={() => onClick(`Why should I ${TRADE_TERM}?`)}
  >
    <div className="pb-2">
      {capitalize(TRADING_TERM)} contributes to accurate answers of important,
      real-world questions.
    </div>
    {SPICE_PRODUCTION_ENABLED && (
      <div className="pb-2">
        {capitalize(TRADE_TERM)} to win prizepoints! Redeem them and we will
        donate to a charity of your choice. Our users have{' '}
        <a
          className="text-primary-700 hover:underline"
          target="_blank"
          href="https://manifold.markets/calibration"
        >
          raised over $300,000 for charity
        </a>{' '}
        so far!
      </div>
    )}

    <div className="pb-2">Get started for free! No credit card required.</div>
  </ExpandSection>
)

const Accuracy = ({ onClick }: { onClick: (sectionTitle: string) => void }) => (
  <ExpandSection
    title={
      <>
        <TbTargetArrow className="mr-2" /> Are our predictions accurate?
      </>
    }
    onClick={() => onClick('Are our forecasts accurate?')}
  >
    <div className="pb-2">
      Yes! Manifold is{' '}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://manifold.markets/calibration"
      >
        very well calibrated
      </a>
      , with forecasts on average within <strong>4 percentage points</strong> of
      the true probability. Our probabilities are created by users buying and
      selling shares of a market.
    </div>
    <div className="pb-2">
      In the 2022 US midterm elections, we {''}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://firstsigma.substack.com/p/midterm-elections-forecast-comparison-analysis"
      >
        outperformed all other prediction market platforms {''}
      </a>
      and were in line with FiveThirtyEight’s performance. Many people who don't
      like {TRADING_TERM} still use Manifold to get reliable news.
    </div>
    <div></div>
  </ExpandSection>
)
