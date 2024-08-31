import { MultiContract } from 'common/contract'
import { getContractFromSlug } from 'common/supabase/contracts'
import { PoliticsCard } from 'web/components/us-elections/contracts/politics-card'
import { useTracking } from 'web/hooks/use-tracking'
import { ELECTION_PARTY_CONTRACT_SLUG } from 'web/lib/politics/home'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import Custom404 from '../404'

interface ElectionNeedleProps {
  electionPartyContract: MultiContract | null
}

function ElectionNeedle({ electionPartyContract }: ElectionNeedleProps) {
  useTracking('view election needle')

  if (!electionPartyContract) {
    return <Custom404 />
  }

  return (
    <PoliticsCard
      contract={electionPartyContract}
      viewType="PARTY"
      customTitle="Which party will win the Presidential Election?"
    />
  )
}

export default function ElectionNeedlePage({
  electionPartyContract,
}: ElectionNeedleProps) {
  return <ElectionNeedle electionPartyContract={electionPartyContract} />
}

export async function getStaticProps() {
  const adminDb = await initSupabaseAdmin()
  const electionPartyContract = await getContractFromSlug(
    adminDb,
    ELECTION_PARTY_CONTRACT_SLUG
  )
  return {
    props: {
      electionPartyContract,
    },
    revalidate: 60,
  }
}
