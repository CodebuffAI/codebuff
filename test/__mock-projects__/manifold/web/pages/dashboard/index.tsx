import { CreateDashboardButton } from 'web/components/dashboard/create-dashboard-button'
import { DashboardSearch } from 'web/components/dashboard/dashboard-search'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'

export default function DashboardPage() {
  useRedirectIfSignedOut()
  const user = useUser()

  return (
    <Page trackPageView={'dashboards page'} className="items-center">
      <Col className="w-full max-w-2xl">
        <Row className="mb-3 mt-1 items-start justify-between">
          <h1 className="text-primary-700 text-2xl">Dashboards</h1>
          {user && <CreateDashboardButton />}
        </Row>
        <DashboardSearch />
      </Col>
    </Page>
  )
}
