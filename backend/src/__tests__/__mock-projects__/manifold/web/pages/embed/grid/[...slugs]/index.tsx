import { Contract } from 'common/contract'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { getContracts } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params
  const adminDb = await initSupabaseAdmin()
  const contracts = await getContracts(adminDb, slugs, 'slug')

  return {
    props: {
      contracts,
    },
    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractGridPage(props: { contracts: Contract[] }) {
  const { contracts } = props

  return (
    <>
      <ContractsGrid
        contracts={contracts}
        breakpointColumns={{ default: 2, 650: 1 }}
      />
    </>
  )
}
