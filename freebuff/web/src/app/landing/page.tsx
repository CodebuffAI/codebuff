// NB: `@/components/*` is aliased to `src/vly/components/*` in this package's
// tsconfig, so the landing components are imported relatively instead.
import { LandingPage } from '../../components/landing/LandingPage'
import type { BlogPostPreview } from '../../components/landing/sections/BlogPreview'

import { formatShortDate } from '@/lib/blog/format-date'
import { getAllPosts } from '@/lib/blog/registry'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Freebuff — We make coding 100% free',
  description:
    'No subscriptions. No API keys. Start in seconds. The free coding agent for your terminal, web, and chat.',
  robots: { index: false, follow: false },
}

export default function Page() {
  const posts: BlogPostPreview[] = getAllPosts().map((p) => ({
    slug: p.slug,
    title: p.title,
    category: p.category,
    subtitle: p.subtitle ?? p.description,
    date: formatShortDate(p.publishedAt),
    read: `${p.readingMinutes} min`,
  }))

  return <LandingPage posts={posts} />
}
