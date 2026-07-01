import { blogConfig } from '@/lib/blog/config'
import { getAllPosts } from '@/lib/blog/registry'
import { siteConfig } from '@/lib/constant'
import { getCommunitySitemapData } from '@/server/community-seo'

import type { MetadataRoute } from 'next'

/**
 * Canonical sitemap served at /sitemap.xml.
 *
 * Includes the marketing pages (home, blog, public /web/* routes) and every
 * published blog post. The nested /web/sitemap.xml exists for legacy
 * Search Console submissions; this one is the authoritative source.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = siteConfig.url()

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/cli`,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/cloud`,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}${blogConfig.basePath}`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/get-started`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/live`,
      changeFrequency: 'daily',
      priority: 0.75,
    },
    {
      url: `${siteUrl}/web`,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/web/about`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/web/community`,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/web/community/explore`,
      changeFrequency: 'daily',
      priority: 0.65,
    },
    {
      url: `${siteUrl}/web/community/leaderboard`,
      changeFrequency: 'daily',
      priority: 0.6,
    },
    {
      url: `${siteUrl}/web/contact`,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${siteUrl}/web/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/web/terms`,
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

  const communityData = await getCommunitySitemapData()
  const communityProjectEntries: MetadataRoute.Sitemap =
    communityData.posts.map((post) => ({
      url: `${siteUrl}/web/community/project/${post._id}`,
      lastModified: new Date(post.updatedAt).toISOString(),
      changeFrequency: 'weekly',
      priority: 0.55,
    }))
  const communityProfileEntries: MetadataRoute.Sitemap =
    communityData.users.map((user) => ({
      url: `${siteUrl}/web/community/profile/${user._id}`,
      lastModified: new Date(user.updatedAt).toISOString(),
      changeFrequency: 'weekly',
      priority: 0.45,
    }))

  return [
    ...staticEntries,
    ...postEntries,
    ...communityProjectEntries,
    ...communityProfileEntries,
  ]
}
