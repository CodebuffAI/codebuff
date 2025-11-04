import { env } from '@codebuff/common/env'
import { getCachedAgents } from '@/server/agents-data'

import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'http://localhost:3000'
  const toUrl = (path: string) => `${base}${path}`

  const items: MetadataRoute.Sitemap = [
    {
      url: toUrl('/'),
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 1,
      alternates: {
        languages: {
          pl: toUrl('/pl'),
        },
      },
    },
    {
      url: toUrl('/store'),
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
  ]

  // Include agent detail pages and publisher pages derived from cached store data
  try {
    const agents = await getCachedAgents()

    const seenPublishers = new Set<string>()
    for (const agent of agents) {
      const pubId = agent.publisher?.id
      if (pubId && !seenPublishers.has(pubId)) {
        items.push({
          url: toUrl(`/publishers/${pubId}`),
          lastModified: new Date(agent.last_used || agent.created_at),
          changeFrequency: 'daily',
          priority: 0.7,
        })
        seenPublishers.add(pubId)
      }

      if (pubId && agent.id && agent.version) {
        items.push({
          url: toUrl(`/publishers/${pubId}/agents/${agent.id}/${agent.version}`),
          lastModified: new Date(agent.last_used || agent.created_at),
          changeFrequency: 'daily',
          priority: 0.8,
        })
      }
    }
  } catch {
    // If fetching fails, fall back to base entries only
  }

  return items
}
