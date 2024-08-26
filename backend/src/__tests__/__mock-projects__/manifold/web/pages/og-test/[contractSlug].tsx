import { ContractParams, MaybeAuthedContractParams } from 'common/contract'
import { getContractOGProps } from 'common/contract-seo'
import { removeUndefinedProps } from 'common/util/object'
import { buildOgUrl } from 'common/util/og'
import { OgMarket } from 'web/components/og/og-market'
import { getStaticProps as getStaticWebProps } from 'web/pages/[username]/[contractSlug]'

// All of this is very copied from main page

export async function getStaticProps(ctx: {
  params: { username: string; contractSlug: string }
}) {
  return getStaticWebProps(ctx)
}

export default function OGTestPage(props: MaybeAuthedContractParams) {
  if (props.state !== 'authed') {
    return <>bruh</>
  }

  return <OriginalGangstaTestPage {...props.params} />
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

function OriginalGangstaTestPage(props: ContractParams) {
  const { contract, pointsString } = props
  const ogCardProps = removeUndefinedProps({
    ...getContractOGProps(contract),
    points: pointsString,
  })

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center">
      <div className="text-ink-900 mb-2 mt-6 text-xl">social preview image</div>
      <img
        src={buildOgUrl(ogCardProps as any, 'market')}
        height={315}
        width={600}
        alt=""
      />

      <div className="text-ink-900 mb-2 mt-6 text-xl">
        og card component (try inspecting)
      </div>
      <div className="h-[315px] w-[600px] resize overflow-hidden">
        <OgMarket {...ogCardProps} />
      </div>
    </div>
  )
}
