import {
  NewsDashboardPageProps,
  SuccesNewsDashboardPageProps,
} from 'web/public/data/elections-data'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { capitalize, first } from 'lodash'
import { Col } from 'web/components/layout/col'
import { getDashboardProps } from 'web/lib/politics/news-dashboard'
import Custom404 from 'web/pages/404'
import NewsPage from 'web/pages/news/[slug]'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useMultiDashboard } from 'web/hooks/use-multi-dashboard'
import { MultiDashboardHeadlineTabs } from 'web/components/dashboard/multi-dashboard-header'
import { api } from 'web/lib/api/api'
import { Headline } from 'common/news'
import { DashboardPage } from 'web/components/dashboard/dashboard-page'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { referralQuery } from 'common/util/share'
import { Row } from 'web/components/layout/row'
import { HorizontalDashboard } from 'web/components/dashboard/horizontal-dashboard'
import { contractPath, CPMMNumericContract } from 'common/contract'
import { getExpectedValue } from 'common/multi-numeric'
import { Clock } from 'web/components/clock/clock'
import { NumericBetPanel } from 'web/components/answers/numeric-bet-panel'
import Link from 'next/link'
import clsx from 'clsx'
import { linkClass } from 'web/components/widgets/site-link'
import { useLiveContractWithAnswers } from 'web/hooks/use-contract'
import { getContract } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'

// In order to duplicate:
// - duplicate this directory (endpoint/[[...slug]].tsx)
// - edit ENDPOINT, TOP_SLUG, SEO, title, description copy
// - create ${ENDPOINT}_importance_score in dashboard table
// - create `${ENDPOINT}headlines` dashboard to fill trending markets carousel
// - edit schema to accept your new ENDPOINT
const ENDPOINT = 'ai'
const TOP_SLUG = 'home'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

const revalidate = 60
export async function getStaticProps(props: { params: { slug: string[] } }) {
  const slug = first(props.params.slug)
  if (slug) {
    try {
      const props = await getDashboardProps(slug, {
        topSlug: TOP_SLUG,
        slug: ENDPOINT,
      })
      return {
        props,
        revalidate,
      }
    } catch (e) {
      return {
        props: { state: 'not found' },
        revalidate,
      }
    }
  }
  const headlines = await api('headlines', { slug: ENDPOINT })

  const newsDashboards = await Promise.all(
    headlines.map(async (headline) => getDashboardProps(headline.slug))
  )
  const trendingDashboard = await getDashboardProps(ENDPOINT + 'headline')
  headlines.unshift({
    id: TOP_SLUG,
    slug: TOP_SLUG,
    title: capitalize(TOP_SLUG),
  })
  const whenAgi = await getContract(db, 'Gtv5mhjKaiLD6Bkvfhcv')

  return {
    props: {
      newsDashboards,
      headlines,
      trendingDashboard,
      whenAgi,
    } as MultiDashboardProps,
    revalidate,
  }
}
type MultiDashboardProps = {
  newsDashboards: NewsDashboardPageProps[]
  headlines: Headline[]
  trendingDashboard: NewsDashboardPageProps
  whenAgi: CPMMNumericContract
}
export default function MultiOrSingleDashboardPage(
  props: MultiDashboardProps | NewsDashboardPageProps
) {
  const user = useUser()
  useSaveReferral(user)
  useSaveCampaign()

  // Unknown dashboard
  if ('state' in props && props.state === 'not found') {
    return <Custom404 />
  }
  // Dashboard
  if ('initialDashboard' in props) {
    return <NewsPage {...props} endpoint={ENDPOINT} />
  }
  // Multi dasbhoard home page
  return <MultiDashboard {...props} />
}

// Note: I previously saw INSUFFICIENT_RESOURCES errors when trying to render all the dashboards
const MAX_DASHBOARDS = 12

function MultiDashboard(props: MultiDashboardProps) {
  const { trendingDashboard } = props
  const newsDashboards = props.newsDashboards.slice(0, MAX_DASHBOARDS)
  const headlines = props.headlines.slice(0, MAX_DASHBOARDS)
  const { currentSlug, headlineSlugsToRefs, onClick } = useMultiDashboard(
    headlines,
    ENDPOINT,
    TOP_SLUG
  )
  const whenAgi = useLiveContractWithAnswers(props.whenAgi)

  const user = useUser()
  const expectedValueAGI = getExpectedValue(whenAgi)
  const eventYear = Math.floor(expectedValueAGI)
  const eventMonth = Math.round((expectedValueAGI - eventYear) * 12)
  const expectedYear = new Date(eventYear, eventMonth, 1)

  return (
    <Page trackPageView="ai multi dashboard">
      <SEO
        title="Manifold Artificial Intelligence Forecasts"
        description="Live prediction market odds on all things AI"
        image="/ai.png"
      />
      <MultiDashboardHeadlineTabs
        headlines={headlines}
        currentSlug={currentSlug}
        onClick={onClick}
        endpoint={ENDPOINT}
        topSlug={TOP_SLUG}
      />

      <Col className="mb-8 gap-6 px-2 sm:gap-8 sm:px-4">
        <Col className={'gap-2'}>
          <div
            ref={headlineSlugsToRefs.current[TOP_SLUG]}
            className="text-primary-700 mt-4 text-2xl font-normal sm:mt-0 sm:text-3xl"
          >
            Manifold AI Forecasts
            <CopyLinkOrShareButton
              url={`https://${ENV_CONFIG.domain}/${ENDPOINT}${
                user?.username ? referralQuery(user.username) : ''
              }`}
              eventTrackingName="copy ai share link"
              tooltip="Share"
              className="hidden sm:inline"
            />
          </div>
          <div className="text-canvas-500 text-md -mb-4 mt-2 flex font-normal">
            Live prediction market odds on all things AI
          </div>
        </Col>

        <Col className={'my-4 w-full justify-center'}>
          <Link
            href={contractPath(whenAgi)}
            className={clsx(linkClass, 'text-primary-700 mb-2 text-xl')}
          >
            Countdown to AGI
          </Link>
          <span className={'mb-4'}>
            The market expects we achieve artificial general intelligence by{' '}
            {expectedYear.getFullYear()}... What do you think?
          </span>
          <Row className={'w-full justify-center'}>
            <Col className={'w-fit  gap-4'}>
              <Clock year={expectedValueAGI} />
              <NumericBetPanel
                contract={whenAgi}
                labels={{
                  lower: 'sooner',
                  higher: 'later',
                }}
              />
            </Col>
          </Row>
        </Col>

        <Col className="px-1">
          <Row className="items-center gap-1 font-semibold sm:text-lg">
            <div className="relative">
              <div className="h-4 w-4 animate-pulse rounded-full bg-indigo-500/40" />
              <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-indigo-500" />
            </div>
            <span>Trending</span>
          </Row>
          {trendingDashboard.state === 'success' && (
            <HorizontalDashboard
              initialDashboard={trendingDashboard.initialDashboard}
              previews={trendingDashboard.previews}
              initialContracts={trendingDashboard.initialContracts}
              slug={trendingDashboard.slug}
            />
          )}
        </Col>
      </Col>
      {newsDashboards.map((dashboard) =>
        dashboard.state === 'not found' ? null : (
          <Col className={'relative my-4'} key={dashboard.slug + 'section'}>
            <div
              className={'absolute -top-12'}
              ref={headlineSlugsToRefs.current[dashboard.slug]}
            />
            <DashboardPage
              {...(dashboard as SuccesNewsDashboardPageProps)}
              editByDefault={false}
              embeddedInParent={true}
              endpoint={ENDPOINT}
              className="!max-w-none"
            />
          </Col>
        )
      )}
    </Page>
  )
}
