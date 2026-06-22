import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AuthorAvatar } from '@/components/blog/author-avatar'
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  OrganizationJsonLd,
} from '@/components/blog/json-ld'
import { PostBody } from '@/components/blog/post-body'
import { PostCard } from '@/components/blog/post-card'
import { PostHero } from '@/components/blog/post-hero'
import { getAuthor } from '@/lib/blog/authors'
import { blogConfig } from '@/lib/blog/config'
import {
  getAllPosts,
  getPostBySlug,
  getRelatedPosts,
} from '@/lib/blog/registry'
import { siteConfig } from '@/lib/constant'

import type { Metadata } from 'next'

export const dynamic = 'force-static'
export const revalidate = 3600
export const dynamicParams = false

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}

  const siteUrl = siteConfig.url()
  const canonical = post.canonical ?? `${siteUrl}${blogConfig.basePath}/${post.slug}`
  const image = post.ogImage
    ? `${siteUrl}${post.ogImage}`
    : `${siteUrl}${blogConfig.defaultOgImage}`
  const author = getAuthor(post.authorId)
  const allAuthors = [author, ...(post.coAuthorIds ?? []).map(getAuthor)]

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    authors: allAuthors.map((a) => ({ name: a.name })),
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description: post.description,
      url: canonical,
      type: 'article',
      siteName: blogConfig.brand,
      locale: blogConfig.locale,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      authors: allAuthors.map((a) => a.name),
      tags: post.keywords,
      images: [{ url: image, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      site: `@${blogConfig.twitterHandle}`,
      images: [image],
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const siteUrl = siteConfig.url()
  const related = getRelatedPosts(post.slug, 3)
  const author = getAuthor(post.authorId)

  return (
    <>
      <OrganizationJsonLd siteUrl={siteUrl} />
      <ArticleJsonLd siteUrl={siteUrl} post={post} />
      <BreadcrumbJsonLd
        siteUrl={siteUrl}
        trail={[
          { name: 'Home', href: '/' },
          { name: 'Blog', href: blogConfig.basePath },
          { name: post.title, href: `${blogConfig.basePath}/${post.slug}` },
        ]}
      />

      <article className="container mx-auto max-w-3xl px-4 pt-28 pb-16 md:pt-36">
        <PostHero post={post} />
        <div className="mt-10" data-speakable="true">
          <PostBody blocks={post.body} />
        </div>

        <footer className="mt-16 space-y-8 border-t border-white/10 pt-8">
          {author.bio && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                About the author
              </p>
              <div className="mt-3 flex items-start gap-4">
                <AuthorAvatar author={author} size="lg" />
                <div className="flex-1">
                  <p className="text-base font-semibold text-white">
                    {author.name}
                    {author.role && (
                      <span className="ml-2 font-normal text-zinc-500">
                        · {author.role}
                      </span>
                    )}
                  </p>
                  <p className="mt-2 leading-relaxed text-zinc-400">
                    {author.bio}
                  </p>
                  {author.twitter && (
                    <Link
                      href={`https://twitter.com/${author.twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block text-sm text-acid-matrix hover:underline"
                    >
                      @{author.twitter}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {post.keywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-600">Topics:</span>
              {post.keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-zinc-400"
                >
                  {k}
                </span>
              ))}
            </div>
          )}
        </footer>
      </article>

      {related.length > 0 && (
        <section className="container mx-auto max-w-6xl px-4 pb-24">
          <h2 className="mb-6 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Keep reading
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {related.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
