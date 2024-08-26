import { useRouter } from 'next/router'
import Custom404 from '../404'
import {
  DashboardEndpoints,
  DashboardPage,
} from 'web/components/dashboard/dashboard-page'
import { Page } from 'web/components/layout/page'
import { getDashboardProps } from 'web/lib/politics/news-dashboard'
import { NewsDashboardPageProps } from 'web/public/data/elections-data'

export async function getStaticProps(ctx: { params: { slug: string } }) {
  const { slug } = ctx.params
  try {
    const props = await getDashboardProps(slug)
    return {
      props,
    }
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 404) {
      return {
        props: { state: 'not found' },
        revalidate: 60,
      }
    }
    throw e
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function NewsPage(
  props: NewsDashboardPageProps & {
    endpoint?: DashboardEndpoints
  }
) {
  const router = useRouter()
  const edit = !!router.query.edit

  if (props.state === 'not found') {
    return <Custom404 />
  } else {
    const { initialDashboard, endpoint } = props
    return (
      <Page
        trackPageView={'dashboard slug page'}
        trackPageProps={{
          slug: initialDashboard.slug,
          title: initialDashboard.title,
        }}
        className="items-center"
      >
        <DashboardPage
          {...props}
          editByDefault={edit}
          endpoint={endpoint ?? 'news'}
        />
      </Page>
    )
  }
}
