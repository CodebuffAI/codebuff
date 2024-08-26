import { Contract } from 'common/contract'
import { orderBy } from 'lodash'
import { Topic } from 'common/group'

export const orderAndDedupeGroupContracts = (
  topics: Pick<Topic, 'importanceScore' | 'slug'>[],
  groupContracts: [string, Contract][],
  limitPerTopic: number
) => {
  // Order so we can remove duplicates from less important groups
  const orderedGroupContracts = orderBy(
    groupContracts,
    (gc) => topics.find((g) => g.slug === gc[0])?.importanceScore,
    'desc'
  )
  const marketsByTopicSlug = {} as Record<string, Contract[]>
  // Group and remove duplicates
  for (const [slug, contract] of orderedGroupContracts) {
    if (!marketsByTopicSlug[slug]) marketsByTopicSlug[slug] = []
    const addedMarketIds = Object.values(marketsByTopicSlug)
      .flat()
      .map((c) => c.id)
    if (
      !addedMarketIds.includes(contract.id) &&
      marketsByTopicSlug[slug].length < limitPerTopic
    )
      marketsByTopicSlug[slug].push(contract)
  }
  return marketsByTopicSlug
}
