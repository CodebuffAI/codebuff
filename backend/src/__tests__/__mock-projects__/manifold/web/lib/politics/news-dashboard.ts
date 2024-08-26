import { api } from 'web/lib/api/api'
import { DashboardLinkItem, DashboardQuestionItem } from 'common/dashboard'
import { fetchLinkPreviews } from 'common/link-preview'
import { removeUndefinedProps } from 'common/util/object'
import { capitalize, omit } from 'lodash'
import { DashboardEndpoints } from 'web/components/dashboard/dashboard-page'
import { getContracts } from 'common/supabase/contracts'
import { db } from '../supabase/db'

export const getDashboardProps = async (
  slug: string,
  endpointProps?: { slug: DashboardEndpoints; topSlug: string }
) => {
  const dashboard = await api('get-dashboard-from-slug', {
    dashboardSlug: slug,
  })

  const links = dashboard.items
    .filter((item): item is DashboardLinkItem => item.type === 'link')
    .map((item) => item.url)

  const questionSlugs = dashboard.items
    .filter((item): item is DashboardQuestionItem => item.type === 'question')
    .map((item) => item.slug)
    .slice(0, 20) // preload just the first n questions

  const previews = await fetchLinkPreviews(links)
  const fullContracts = await getContracts(db, questionSlugs, 'slug')
  const contracts = fullContracts.map((c) =>
    // remove some heavy fields that are not needed for the cards
    removeUndefinedProps(omit(c, 'description', 'coverImageUrl'))
  )

  const headlines = await api(
    'headlines',
    removeUndefinedProps({ slug: endpointProps?.slug })
  )
  if (endpointProps?.topSlug) {
    const topSlug = endpointProps.topSlug
    headlines.unshift({
      id: topSlug,
      slug: '',
      title: capitalize(topSlug),
    })
  }
  return {
    state: 'success',
    initialDashboard: dashboard,
    headlines,
    previews,
    initialContracts: contracts,
    slug,
  }
}
