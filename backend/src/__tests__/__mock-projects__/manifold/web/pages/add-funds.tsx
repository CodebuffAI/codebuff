import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { BuyManaTab } from 'web/components/add-funds-modal'

export default function AddFundsPage() {
  useRedirectIfSignedOut()

  return (
    <Page trackPageView={'add funds'}>
      <SEO
        title="Get mana"
        description="Buy mana to trade in your favorite questions on Manifold"
        url="/add-funds"
      />

      <Col className="bg-canvas-0 mx-auto max-w-[700px] rounded p-4 py-8 sm:p-8 sm:shadow-md">
        <Title>Get Mana</Title>

        <BuyManaTab onClose={() => {}} />
      </Col>
    </Page>
  )
}
