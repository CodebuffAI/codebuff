/**
 * JSON-LD structured data helpers.
 *
 * GEO ("Generative Engine Optimization") and traditional SEO both benefit from
 * accurate schema.org markup. We emit it as <script type="application/ld+json">
 * inside the page so it ships server-side without hydration cost.
 */
import { getAuthor } from '@/lib/blog/authors'
import { blogConfig } from '@/lib/blog/config'

import type { Post } from '@/lib/blog/types'

function plainTextFromBlocks(post: Post): string {
  const parts: string[] = [post.description]
  for (const b of post.body) {
    switch (b.type) {
      case 'p':
      case 'lede':
        parts.push(b.text)
        break
      case 'h2':
      case 'h3':
        parts.push(b.text)
        break
      case 'ul':
      case 'ol':
      case 'tldr':
        parts.push(b.items.join(' '))
        break
      case 'callout':
        parts.push(b.text)
        break
      case 'quote':
        parts.push(b.text)
        break
      case 'faq':
        parts.push(b.items.map((i) => `${i.q} ${i.a}`).join(' '))
        break
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').slice(0, 5000)
}

function Json({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export function OrganizationJsonLd({ siteUrl }: { siteUrl: string }) {
  return (
    <Json
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: blogConfig.publisherName,
        url: siteUrl,
        logo: `${siteUrl}${blogConfig.publisherLogo}`,
        sameAs: [
          'https://github.com/CodebuffAI/codebuff',
          'https://codebuff.com',
        ],
      }}
    />
  )
}

export function WebSiteJsonLd({ siteUrl }: { siteUrl: string }) {
  return (
    <Json
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: blogConfig.brand,
        url: siteUrl,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${siteUrl}/blog?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      }}
    />
  )
}

export function BlogJsonLd({
  siteUrl,
  posts,
}: {
  siteUrl: string
  posts: Pick<Post, 'slug' | 'title' | 'description' | 'publishedAt' | 'authorId'>[]
}) {
  return (
    <Json
      data={{
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: `${blogConfig.brand} Blog`,
        url: `${siteUrl}${blogConfig.basePath}`,
        publisher: {
          '@type': 'Organization',
          name: blogConfig.publisherName,
          logo: {
            '@type': 'ImageObject',
            url: `${siteUrl}${blogConfig.publisherLogo}`,
          },
        },
        blogPost: posts.map((p) => {
          const a = getAuthor(p.authorId)
          return {
            '@type': 'BlogPosting',
            headline: p.title,
            description: p.description,
            url: `${siteUrl}${blogConfig.basePath}/${p.slug}`,
            datePublished: p.publishedAt,
            author: { '@type': 'Person', name: a.name },
          }
        }),
      }}
    />
  )
}

export function ArticleJsonLd({
  siteUrl,
  post,
}: {
  siteUrl: string
  post: Post
}) {
  const author = getAuthor(post.authorId)
  const coAuthors = (post.coAuthorIds ?? []).map(getAuthor)
  const allAuthors = [author, ...coAuthors]
  const url = `${siteUrl}${blogConfig.basePath}/${post.slug}`
  const image = post.ogImage
    ? `${siteUrl}${post.ogImage}`
    : `${siteUrl}${blogConfig.defaultOgImage}`

  return (
    <>
      <Json
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
          headline: post.title,
          description: post.description,
          image,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt ?? post.publishedAt,
          author: allAuthors.map((a) => ({
            '@type': 'Person',
            name: a.name,
            ...(a.twitter ? { url: `https://twitter.com/${a.twitter}` } : {}),
          })),
          publisher: {
            '@type': 'Organization',
            name: blogConfig.publisherName,
            logo: {
              '@type': 'ImageObject',
              url: `${siteUrl}${blogConfig.publisherLogo}`,
            },
          },
          keywords: post.keywords.join(', '),
          articleSection: post.category,
          wordCount: plainTextFromBlocks(post).split(/\s+/).length,
          inLanguage: 'en-US',
          /**
           * `speakable` is consumed by Google\u2019s GEO surfaces (and now most
           * AI summarizers) to know which parts of the page are safe to
           * read aloud or quote. Pointing at our TL;DR and headings gives the
           * highest-signal summary.
           */
          speakable: {
            '@type': 'SpeakableSpecification',
            cssSelector: ['h1', '[data-speakable="true"]', 'h2'],
          },
        }}
      />
      <FaqJsonLdFromPost post={post} />
    </>
  )
}

function FaqJsonLdFromPost({ post }: { post: Post }) {
  const faq = post.body.find((b) => b.type === 'faq')
  if (!faq || faq.type !== 'faq' || faq.items.length === 0) return null
  return (
    <Json
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      }}
    />
  )
}

export function BreadcrumbJsonLd({
  siteUrl,
  trail,
}: {
  siteUrl: string
  trail: Array<{ name: string; href: string }>
}) {
  return (
    <Json
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((t, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: t.name,
          item: `${siteUrl}${t.href}`,
        })),
      }}
    />
  )
}
