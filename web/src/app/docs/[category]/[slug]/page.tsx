import { env } from '@codebuff/common/env'
import dynamic from 'next/dynamic'
import NextLink from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import type { Doc } from '@/types/docs'

import { allDocs } from '.contentlayer/generated'
import { Mdx } from '@/components/docs/mdx/mdx-components'
import { getDocsByCategory } from '@/lib/docs'

// Generate static params for all doc pages at build time
export function generateStaticParams(): Array<{
  category: string
  slug: string
}> {
  return allDocs
    .filter((doc) => !doc.slug.startsWith('_'))
    .map((doc) => ({
      category: doc.category,
      slug: doc.slug,
    }))
}

// FAQ structured data for SEO - parsed from the FAQ MDX content
const FAQ_ITEMS = [
  {
    question: 'What can Openbuff be used for?',
    answer:
      'Software development: Writing features, tests, and scripts across common languages and frameworks. It can also run CLI commands, adjust build configs, review code, and answer questions about your repo.',
  },
  {
    question: 'What model does Openbuff use?',
    answer:
      'Openbuff uses the provider and model routes configured in openbuff.json. Default, Plan, and individual subagents can all be mapped to different models; Openbuff does not provide hosted inference or a fixed model lineup.',
  },
  {
    question: 'Is Openbuff open source?',
    answer: "Yes. It's Apache 2.0 at github.com/AnzoBenjamin/openbuff.",
  },
  {
    question: 'Do you store my data?',
    answer:
      'Openbuff does not have a hosted backend. Your code is sent only to the model providers you configure in openbuff.json.',
  },
  {
    question:
      'Do you use model providers that train on my codebase or chat data?',
    answer:
      'You configure your own providers via openbuff.json. Check the data policies of your chosen providers directly.',
  },
  {
    question: 'Can I trust Openbuff with full access to my terminal?',
    answer:
      'If you want isolation, use the Dockerfile to run Openbuff against a scoped copy of your codebase.',
  },
  {
    question: 'Can I specify custom instructions for Openbuff?',
    answer:
      "Yes. Add knowledge.md files to describe patterns, constraints, and commands. Openbuff also reads AGENTS.md and CLAUDE.md if present. Per directory, it picks one: knowledge.md first, then AGENTS.md, then CLAUDE.md. Openbuff updates existing knowledge files but won't create them unless you ask.",
  },
  {
    question: 'Can I tell Openbuff to ignore certain files?',
    answer:
      'Openbuff by default will not read files that are specified in your .gitignore. You can also create a .codebuffignore file to specify additional files or folders to ignore.',
  },
  {
    question: 'How does Openbuff work?',
    answer:
      'Openbuff runs specialized local agent loops: one can find files, another can reason through the problem, another writes code, and another reviews. All model calls go to your configured providers. In Max mode, multiple implementation proposals compete.',
  },
  {
    question: 'How does Openbuff compare to Claude Code?',
    answer:
      'Openbuff is a local-first, BYOK multi-agent coding CLI. See the detailed comparison in our documentation.',
  },
]

function FAQJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

// Breadcrumb JSON-LD for docs pages
function DocsBreadcrumbJsonLd({
  category,
  title,
  slug,
}: {
  category: string
  title: string
  slug: string
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Documentation',
        item: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/docs`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: category.charAt(0).toUpperCase() + category.slice(1),
        item: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/docs/${category}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: title,
        item: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/docs/${category}/${slug}`,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

const DocNavigation = ({
  sortedDocs,
  category,
  currentSlug,
}: {
  sortedDocs: Doc[]
  category: string
  currentSlug: string
}) => {
  const currentIndex = sortedDocs.findIndex((d) => d.slug === currentSlug)
  const prevDoc = currentIndex > 0 ? sortedDocs[currentIndex - 1] : null
  const nextDoc =
    currentIndex < sortedDocs.length - 1 ? sortedDocs[currentIndex + 1] : null

  return (
    <div className="flex justify-between items-center pt-8 mt-8 border-t">
      {prevDoc && (
        <NextLink
          href={`/docs/${category}/${prevDoc.slug}`}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="font-medium">{prevDoc.title}</span>
        </NextLink>
      )}
      {nextDoc && (
        <NextLink
          href={`/docs/${category}/${nextDoc.slug}`}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors ml-auto"
        >
          <span className="font-medium">{nextDoc.title}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </NextLink>
      )}
    </div>
  )
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>
}) {
  const { category, slug } = await params
  const docs = getDocsByCategory(category)
  const doc = docs.find((d: Doc) => d.slug === slug)

  if (!doc) {
    return notFound()
  }

  const sortedDocs = [...docs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const isFaqPage = slug === 'faq'

  return (
    <>
      <DocsBreadcrumbJsonLd category={category} title={doc.title} slug={slug} />
      {isFaqPage && <FAQJsonLd />}
      <div className="max-w-3xl mx-auto">
        <article className="prose dark:prose-invert prose-compact max-w-none overflow-x-auto">
          <Mdx code={doc.body.code} />

          {React.createElement(
            dynamic(() =>
              import(`@/content/${doc.category}/_cta.mdx`).catch(
                () => () => null,
              ),
            ),
          )}
        </article>

        <DocNavigation
          sortedDocs={sortedDocs}
          category={category}
          currentSlug={slug}
        />
      </div>
    </>
  )
}
