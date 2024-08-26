import { MultiContract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { PoliticsCard } from 'web/components/us-elections/contracts/politics-card'
import Custom404 from 'web/pages/404'
import { Row } from './layout/row'
import { HomepageMap } from './usa-map/homepage-map'
import { HorizontalDashboard } from './dashboard/horizontal-dashboard'
import Link from 'next/link'
import { ConditionalMarkets } from './us-elections/contracts/conditional-market/conditional-markets'
import { ElectionsPageProps } from 'web/public/data/elections-data'

export function USElectionsPage(props: ElectionsPageProps) {
  const {
    rawPresidencyStateContracts,
    rawSenateStateContracts,
    rawGovernorStateContracts,
    rawPolicyContracts,
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
    houseContract,
    trendingDashboard,
  } = props

  if (
    !electionPartyContract ||
    !electionCandidateContract ||
    !republicanCandidateContract ||
    !democratCandidateContract ||
    !houseContract
  ) {
    return <Custom404 />
  }

  const trending =
    trendingDashboard.state == 'not found' ? null : (
      <Col className="-mb-6">
        <Row className="items-center gap-1 font-semibold sm:text-lg">
          <div className="relative">
            <div className="h-4 w-4 animate-pulse rounded-full bg-indigo-500/40" />
            <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-indigo-500" />
          </div>
          <Link
            href="/election/politicsheadline"
            className="hover:text-primary-700 hover:underline"
          >
            Trending
          </Link>
        </Row>
        <HorizontalDashboard
          initialDashboard={trendingDashboard.initialDashboard}
          previews={trendingDashboard.previews}
          initialContracts={trendingDashboard.initialContracts}
          slug={trendingDashboard.slug}
        />
      </Col>
    )

  return (
    <Col className="mb-8 gap-6 px-1 sm:gap-8 sm:px-2">
      <Col>
        <div className="text-primary-700 mt-4 text-2xl font-normal sm:mt-0 sm:text-3xl">
          Manifold 2024 Election Forecast
        </div>
        <div className="text-canvas-500 text-md mt-2 flex font-normal">
          Live prediction market odds on the US election
        </div>
      </Col>

      <PoliticsCard
        contract={electionPartyContract as MultiContract}
        viewType="PARTY"
        customTitle="Which party will win the Presidential Election?"
        includeHead
      />

      {trending}

      <HomepageMap
        rawPresidencyStateContracts={rawPresidencyStateContracts}
        rawSenateStateContracts={rawSenateStateContracts}
        rawGovernorStateContracts={rawGovernorStateContracts}
        houseContract={houseContract as MultiContract}
      />

      <PoliticsCard
        contract={electionCandidateContract as MultiContract}
        viewType="CANDIDATE"
        className="-mt-4"
      />

      <ConditionalMarkets rawPolicyContracts={rawPolicyContracts} />
      {/* 
      <PoliticsCard
        contract={electionCandidateContract as MultiContract}
        viewType="CANDIDATE"
        className="-mt-4"
      /> */}
    </Col>
  )
}
