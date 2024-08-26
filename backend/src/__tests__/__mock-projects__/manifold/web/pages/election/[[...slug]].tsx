import { ElectionsPageProps } from 'web/public/data/elections-data'
import { getElectionsPageProps } from 'web/lib/politics/home'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { USElectionsPage } from 'web/components/elections-page'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveContractVisitsLocally } from 'web/hooks/use-save-visits'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const revalidate = 60

export async function getStaticProps() {
  const electionsPageProps = await getElectionsPageProps()
  return {
    props: electionsPageProps,
    revalidate,
  }
}

export default function Elections(props: ElectionsPageProps) {
  const user = useUser()
  useSaveReferral(user)
  // mark US prez contract as seen to ensure US Politics group is auto-selected during onboarding
  useSaveContractVisitsLocally(user === null, 'ikSUiiNS8MwAI75RwEJf')
  useSaveCampaign()

  return (
    <Page trackPageView="us elections page 2024">
      <SEO
        title="Manifold 2024 Election Forecast"
        description="Live prediction market odds on the 2024 US election"
        image="/election-map24.png"
      />

      <USElectionsPage {...props} />
    </Page>
  )
}
