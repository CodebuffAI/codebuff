import { Contract } from 'common/contract'
import { getSeoDescription, getContractOGProps } from 'common/contract-seo'
import { removeUndefinedProps } from 'common/util/object'
import { SEO } from '../SEO'

export function ContractSEO(props: {
  contract: Contract
  /** Base64 encoded points */
  points?: string
}) {
  const { contract, points } = props
  const { question, creatorUsername, slug } = contract

  const seoDesc = getSeoDescription(contract)
  const ogCardProps = removeUndefinedProps({
    ...getContractOGProps(contract),
    points,
  })

  return (
    <SEO
      title={question}
      description={seoDesc}
      url={`/${creatorUsername}/${slug}`}
      ogProps={{ props: ogCardProps, endpoint: 'market' }}
    />
  )
}
