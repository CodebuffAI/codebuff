import { APIResponse } from 'common/api/schema'
import { api } from 'web/lib/api/api'
import { PARTNER_USER_IDS } from 'common/envs/constants'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { Col } from 'web/components/layout/col'
import { FaExternalLinkAlt } from 'react-icons/fa'
import { Row } from 'web/components/layout/row'
import { BackButton } from 'web/components/contract/back-button'
import { useEffect, useState } from 'react'
import LoadingUserRows from 'web/components/loading-user-rows'
import Link from 'next/link'

const PartnerLeaderboard = () => {
  const [partnerStats, setPartnerStats] = useState<
    APIResponse<'get-partner-stats'>[]
  >([])

  useEffect(() => {
    Promise.all(
      PARTNER_USER_IDS.map((userId) => api('get-partner-stats', { userId }))
    ).then(setPartnerStats)
  }, [])

  let totalContractsCreated = 0
  let totalUniqueBettors = 0
  let totalReferrals = 0
  let totalDollarsEarned = 0

  const sortedPartnerStats = partnerStats.sort((a, b) => {
    const dollarsEarnedA = a.dollarsEarned
    const dollarsEarnedB = b.dollarsEarned

    return dollarsEarnedB - dollarsEarnedA
  })

  sortedPartnerStats.forEach((partner) => {
    totalContractsCreated += partner.numContractsCreated
    totalUniqueBettors += partner.numUniqueBettors
    totalReferrals += partner.numReferrals
    totalDollarsEarned += partner.dollarsEarned
  })

  return (
    <Page trackPageView={'partner-leaderboard'}>
      <SEO
        title="Partner Leaderboard"
        description={`Manifold's partner leaderboard show the stats of users in our creator partner program and how much money they earned.`}
        url="/partner-leaderboard"
      />
      <Col className="m-2 mb-4 md:mx-8 ">
        <Row className={'items-center gap-2 md:hidden'}>
          <BackButton />
          <span className={'text-primary-700 text-2xl'}>
            Partner Leaderboard
          </span>
        </Row>
        <Title className="hidden md:inline-flex">Partner Leaderboard</Title>

        <div className="text-primary-500 hover:text-primary-700 text-md mb-2 hover:underline">
          <Link href="/partner-explainer" className="flex items-baseline">
            Learn more about the program here!{' '}
            <FaExternalLinkAlt className="ml-1 h-3 w-3" />
          </Link>
        </div>

        <div className="text-ink-700 mb-3">Period Feb 26 - May 26</div>

        {partnerStats.length === 0 && <LoadingUserRows />}
        {partnerStats.length > 0 && (
          <div className="overflow-x-auto">
            <table className="whitespace-no-wrap w-full table-auto text-left">
              <thead className=" bg-ink-50 text-primary-700 text-xs font-semibold uppercase tracking-wide">
                <tr>
                  <th className="py-3 pl-8">Partner</th>
                  <th className="py-3 pr-4 text-center">Income (USD)</th>
                  <th className="px-4 py-3 text-center">Traders</th>
                  <th className="px-4 py-3 text-center">Referrals</th>
                  <th className="px-4 py-3 text-center">New Markets</th>
                </tr>
              </thead>
              <tbody className="divide-ink-100 divide-y text-sm">
                {sortedPartnerStats.map((partnerStats, index) => {
                  const {
                    username,
                    numContractsCreated,
                    numUniqueBettors,
                    numReferrals,
                    dollarsEarned,
                  } = partnerStats

                  return (
                    <tr key={index} className="bg-canvas-0">
                      <td className="py-3 pl-8">
                        <a
                          className="hover:text-primary-500 hover:underline"
                          href={`/${username}/partner`}
                        >
                          {username}
                        </a>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        ${dollarsEarned.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {numUniqueBettors}
                      </td>
                      <td className="px-4 py-3 text-center">{numReferrals}</td>
                      <td className="px-4 py-3 text-center">
                        {numContractsCreated}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-ink-50 text-primary-700 font-semibold">
                  <td className="py-3 pl-8">
                    Total ({sortedPartnerStats.length})
                  </td>
                  <td className="py-3 pr-4 text-center">
                    ${totalDollarsEarned.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {totalUniqueBettors}
                  </td>
                  <td className="px-4 py-3 text-center">{totalReferrals}</td>
                  <td className="px-4 py-3 text-center">
                    {totalContractsCreated}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Col>
    </Page>
  )
}

export default PartnerLeaderboard
