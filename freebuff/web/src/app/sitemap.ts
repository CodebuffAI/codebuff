import { env } from '@codebuff/common/env'

import { blogConfig } from '@/lib/blog/config'
import { getAllPosts } from '@/lib/blog/registry'

import type { MetadataRoute } from 'next'

/**
 * Canonical sitemap served at /sitemap.xml.
 *
 * Includes the marketing pages (home, blog, public /web/* routes) and every
 * published blog post. The nested /web/sitemap.xml exists for legacy
 * Search Console submissions; this one is the authoritative source.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = env.NEXT_PUBLIC_CODEBUFF_APP_URL
  const now = new Date().toISOString()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    {
      url: `${siteUrl}${blogConfig.basePath}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}${blogConfig.basePath}/rss.xml`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.5,
    },
    { url: `${siteUrl}/web`, lastModified: now, changeFrequency: 'daily', priority: 0.95 },
    { url: `${siteUrl}/web/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${siteUrl}/web/community`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${siteUrl}/web/earn`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${siteUrl}/web/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/web/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/web/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  const postEntries: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${siteUrl}${blogConfig.basePath}/${post.slug}`,
    lastModified: post.updatedAt ?? post.publishedAt,
    changeFrequency: 'monthly',
    priority: post.featured ? 0.85 : 0.7,
  }))

  return [...staticEntries, ...postEntries]
}
