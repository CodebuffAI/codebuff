import { blogConfig } from '@/lib/blog/config'
import { getAllPosts } from '@/lib/blog/registry'
import { siteConfig } from '@/lib/constant'

import type { MetadataRoute } from 'next'

/**
 * Canonical sitemap served at /sitemap.xml.
 *
 * Includes the marketing pages (home, blog, public /web/* routes) and every
 * published blog post. The nested /web/sitemap.xml exists for legacy
 * Search Console submissions; this one is the authoritative source.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = siteConfig.url()
  const now = new Date().toISOString()

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}${blogConfig.basePath}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/get-started`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/web`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.95,
    },
    {
      url: `${siteUrl}/web/pricing`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/web/community`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/web/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${siteUrl}/web/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/web/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  const postEntries: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${siteUrl}${blogConfig.basePath}/${post.slug}`,
    lastModified: post.updatedAt ?? post.publishedAt,
    changeFrequency: 'monthly',
    priority: post.featured ? 0.85 : 0.7,
  }))

  return [...staticEntries, ...postEntries]
}
