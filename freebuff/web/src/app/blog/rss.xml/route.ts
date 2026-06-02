import { env } from '@codebuff/common/env'

import { getAuthor } from '@/lib/blog/authors'
import { blogConfig } from '@/lib/blog/config'
import { getAllPosts } from '@/lib/blog/registry'

export const dynamic = 'force-static'
export const revalidate = 3600

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(): Promise<Response> {
  const siteUrl = env.NEXT_PUBLIC_CODEBUFF_APP_URL
  const posts = getAllPosts()
  const buildDate = new Date().toUTCString()

  const items = posts
    .map((p) => {
      const author = getAuthor(p.authorId)
      const url = `${siteUrl}${blogConfig.basePath}/${p.slug}`
      const pubDate = new Date(p.publishedAt + 'T12:00:00Z').toUTCString()
      return `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(p.description)}</description>
      <category>${escapeXml(p.category)}</category>
      <author>noreply@freebuff.com (${escapeXml(author.name)})</author>
    </item>`
    })
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${blogConfig.brand} Blog`)}</title>
    <link>${siteUrl}${blogConfig.basePath}</link>
    <atom:link href="${siteUrl}${blogConfig.basePath}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml(blogConfig.defaultDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
