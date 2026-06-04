import { Rss } from 'lucide-react'
import Link from 'next/link'

import { FilterableGrid } from '@/components/blog/category-pills'
import {
  BlogJsonLd,
  BreadcrumbJsonLd,
  OrganizationJsonLd,
  WebSiteJsonLd,
} from '@/components/blog/json-ld'
import { PostCard } from '@/components/blog/post-card'
import { blogCategories, blogConfig } from '@/lib/blog/config'
import {
  getAllCategoriesInUse,
  getAllPosts,
  getFeaturedPosts,
} from '@/lib/blog/registry'
import { siteConfig } from '@/lib/constant'

import type { Metadata } from 'next'

export const dynamic = 'force-static'
export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = siteConfig.url()
  const title = `${blogConfig.brand} Blog — free coding agent guides, comparisons, and launches`
  const description =
    'The Freebuff blog: launches, deep dives, and head-to-head guides for the free alternative to Claude Code, Cursor, Codex, Lovable, Replit, Bolt, Windsurf, and every paid coding agent.'

  return {
    title,
    description,
    keywords: [
      'free coding agent',
      'free cli coding agent',
      'free claude code',
      'free cursor',
      'free codex',
      'free lovable',
      'free replit',
      'free bolt.new',
      'free windsurf',
      'free emergent',
      'free devin',
      'ai coding blog',
      'freebuff blog',
    ],
    alternates: { canonical: `${siteUrl}${blogConfig.basePath}` },
    openGraph: {
      title,
      description,
      url: `${siteUrl}${blogConfig.basePath}`,
      type: 'website',
      siteName: blogConfig.brand,
      locale: blogConfig.locale,
      images: [{ url: `${siteUrl}${blogConfig.defaultOgImage}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      site: `@${blogConfig.twitterHandle}`,
    },
  }
}

function renderHeadline(headline: string) {
  const parts = headline.split(/\*(.+?)\*/g)
  return parts.map((part, i) =>
    i % 2 === 0 ? (
      <span key={i}>{part}</span>
    ) : (
      <span key={i} className="text-acid-matrix">
        {part}
      </span>
    ),
  )
}

export default function BlogIndexPage() {
  const siteUrl = siteConfig.url()
  const allPosts = getAllPosts()
  const featured = getFeaturedPosts(blogConfig.featuredCount)
  const inUseCategories = new Set(getAllCategoriesInUse())
  const visibleCategories = blogCategories.filter(
    (c) => c === 'All' || inUseCategories.has(c),
  )

  return (
    <>
      <OrganizationJsonLd siteUrl={siteUrl} />
      <WebSiteJsonLd siteUrl={siteUrl} />
      <BlogJsonLd siteUrl={siteUrl} posts={allPosts} />
      <BreadcrumbJsonLd
        siteUrl={siteUrl}
        trail={[
          { name: 'Home', href: '/' },
          { name: 'Blog', href: blogConfig.basePath },
        ]}
      />

      <section className="container mx-auto max-w-6xl px-4 pt-16 pb-12 md:pt-24">
        <h1 className="font-serif text-4xl font-medium leading-[1.05] text-white md:text-6xl lg:text-7xl">
          {renderHeadline(blogConfig.indexHeadline)}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
          {blogConfig.indexSubhead}
        </p>
        <div className="mt-6">
          <Link
            href={`${blogConfig.basePath}/rss.xml`}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-acid-matrix/40 hover:text-acid-matrix"
          >
            <Rss className="size-3.5" />
            Subscribe via RSS
          </Link>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="container mx-auto max-w-6xl px-4 pb-16">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Editor&apos;s picks
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => (
              <PostCard key={p.slug} post={p} variant="featured" />
            ))}
          </div>
        </section>
      )}

      <section className="container mx-auto max-w-6xl px-4 pb-24">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            All posts
          </h2>
          <span className="text-xs text-zinc-600">
            {allPosts.length} {allPosts.length === 1 ? 'post' : 'posts'}
          </span>
        </div>
        <FilterableGrid posts={allPosts} categories={visibleCategories} />
      </section>
    </>
  )
}
