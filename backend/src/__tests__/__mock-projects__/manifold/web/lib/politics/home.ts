import { Contract, CPMMMultiContract } from 'common/contract'
import { fetchLinkPreviews } from 'common/link-preview'
import { getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import {
  ElectionsPageProps,
  MapContractsDictionary,
  NH_LINK,
  presidency2024,
  StateElectionMarket,
} from 'web/public/data/elections-data'
import { governors2024 } from 'web/public/data/governors-data'
import { senate2024 } from 'web/public/data/senate-state-data'
import { api } from 'web/lib/api/api'
import { getDashboardProps } from 'web/lib/politics/news-dashboard'
import { getMultiBetPoints } from 'common/contract-params'
import { PolicyContractType, PolicyData } from 'web/public/data/policy-data'
import { mapValues } from 'lodash'
import { getBetPoints } from 'web/lib/supabase/bets'

export const ELECTION_PARTY_CONTRACT_SLUG =
  'which-party-will-win-the-2024-us-pr-f4158bf9278a'

export async function getElectionsPageProps() {
  const adminDb = await initSupabaseAdmin()
  const getContract = (slug: string) => getContractFromSlug(adminDb, slug)

  const [
    presidencyStateContracts,
    senateStateContracts,
    governorStateContracts,
    headlines,
  ] = await Promise.all([
    getStateContracts(getContract, presidency2024),
    getStateContracts(getContract, senate2024),
    getStateContracts(getContract, governors2024),
    api('headlines', { slug: 'politics' }),
  ])

  const policyContracts = await getPolicyContracts(getContract)

  const newsDashboards = await Promise.all(
    headlines.map(async (headline) => getDashboardProps(headline.slug))
  )

  const trendingDashboard = await getDashboardProps('politicsheadline')

  const specialContractSlugs = [
    ELECTION_PARTY_CONTRACT_SLUG,
    'who-will-win-the-2024-us-presidenti-8c1c8b2f8964',
    'who-will-win-the-2024-republican-pr-e1332cf40e59',
    'who-will-win-the-2024-democratic-pr-47576e90fa38',
    'who-will-win-the-new-hampshire-repu',
    'who-will-be-the-republican-nominee-8a36dedc6445',
    '2024-house-races-which-congressiona',
    'who-will-be-the-democratic-nominee-9d4a78f63ce1',
    // 'who-would-win-the-us-presidential-e-e43c62c31980',
    // 'who-would-win-the-us-presidential-e-2f4e0b318013',
    'who-would-win-the-presidential-elec',
  ]
  const contractsPromises = specialContractSlugs.map(async (slug) =>
    getContract(slug)
  )

  const [
    electionPartyContract,
    electionCandidateContract,
    republicanCandidateContract,
    democratCandidateContract,
    newHampshireContract,
    republicanVPContract,
    houseContract,
    democraticVPContract,
    democraticElectability,
    // republicanElectability,
  ] = await Promise.all(contractsPromises)

  const linkPreviews = await fetchLinkPreviews([NH_LINK])
  const afterTime = new Date().getTime() - 7 * 24 * 60 * 60 * 1000

  let partyPoints = null
  if (
    electionPartyContract &&
    electionPartyContract.mechanism == 'cpmm-multi-1'
  ) {
    const allBetPoints = await getBetPoints(electionPartyContract.id, {
      afterTime: afterTime,
    })

    const serializedMultiPoints = getMultiBetPoints(
      allBetPoints,
      electionPartyContract as CPMMMultiContract
    )
    partyPoints = mapValues(serializedMultiPoints, (points) =>
      points.map(([x, y]) => ({ x, y } as const))
    )
    // weird hack to get rid of points that I can't figure out how it's getting there
    Object.values(partyPoints).forEach((points) => {
      points.shift()
    })
  }

  return {
    rawPresidencyStateContracts: presidencyStateContracts,
    rawSenateStateContracts: senateStateContracts,
    rawGovernorStateContracts: governorStateContracts,
    rawPolicyContracts: policyContracts,
    electionPartyContract,
    electionCandidateContract,
    republicanCandidateContract,
    democratCandidateContract,
    newHampshireContract,
    republicanVPContract,
    democraticVPContract,
    democraticElectability,
    // republicanElectability,
    linkPreviews,
    newsDashboards,
    headlines,
    trendingDashboard,
    partyGraphData: { partyPoints, afterTime },
    houseContract,
  } as ElectionsPageProps
}

async function getStateContracts(
  getContract: (slug: string) => Promise<Contract | null>,
  stateSlugs: StateElectionMarket[]
): Promise<MapContractsDictionary> {
  const mapContractsPromises = stateSlugs.map(async (m) => {
    const contract = await getContract(m.slug)
    return { state: m.state, contract: contract }
  })

  const mapContractsArray = await Promise.all(mapContractsPromises)

  // Convert array to dictionary
  return mapContractsArray.reduce((acc, mapContract) => {
    acc[mapContract.state] = mapContract.contract
    return acc
  }, {} as MapContractsDictionary)
}

async function getPolicyContracts(
  getContract: (slug: string) => Promise<Contract | null>
): Promise<PolicyContractType[]> {
  const mapContractsPromises = PolicyData.map(async (m) => {
    const harrisContract = await getContract(m.harrisSlug)
    const trumpContract = await getContract(m.trumpSlug)

    return {
      title: m.title,
      harrisContract: harrisContract,
      trumpContract: trumpContract,
    }
  })

  return await Promise.all(mapContractsPromises)
}
