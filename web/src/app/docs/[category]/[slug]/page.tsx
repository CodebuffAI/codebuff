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
    question: 'What can Codebuff be used for?',
    answer:
      'Software development: Writing features, tests, and scripts across common languages and frameworks. It can also run CLI commands, adjust build configs, review code, and answer questions about your repo.',
  },
  {
    question: 'What model does Codebuff use?',
    answer:
      'Multiple. The orchestrator uses Claude Opus 4.6 in Default and Max modes, or Grok 4.1 Fast in Free mode. Subagents are matched to their tasks: Claude Opus 4.6 for code editing, GPT-5.1 for deep reasoning, Grok 4.1 Fast for terminal commands and research, and Relace AI for fast file rewrites.',
  },
  {
    question: 'Can I use my Claude Pro or Max subscription with Codebuff?',
    answer:
      "Yes! If you have a Claude Pro or Max subscription, you can connect it to Codebuff and use your subscription for Claude model requests. This lets you save credits while still benefiting from Codebuff's intelligent orchestration. Run /connect:claude in the CLI to link your subscription. Note: Using your Claude Pro/Max subscription in Codebuff is not officially supported by Anthropic.",
  },
  {
    question: 'Is Codebuff open source?',
    answer: "Yes. It's Apache 2.0 at github.com/CodebuffAI/codebuff.",
  },
  {
    question: 'Do you store my data?',
    answer:
      "We don't store your codebase. The server forwards requests to model providers. We keep small slices of chat logs for debugging.",
  },
  {
    question:
      'Do you use model providers that train on my codebase or chat data?',
    answer:
      "No, we don't choose providers that will train on your data in our standard modes.",
  },
  {
    question: 'Can I trust Codebuff with full access to my terminal?',
    answer:
      'If you want isolation, use the Dockerfile to run Codebuff against a scoped copy of your codebase.',
  },
  {
    question: 'Can I specify custom instructions for Codebuff?',
    answer:
      "Yes. Add knowledge.md files to describe patterns, constraints, and commands. Codebuff also reads AGENTS.md and CLAUDE.md if present. Per directory, it picks one: knowledge.md first, then AGENTS.md, then CLAUDE.md. Codebuff updates existing knowledge files but won't create them unless you ask.",
  },
  {
    question: 'Can I tell Codebuff to ignore certain files?',
    answer:
      'Codebuff by default will not read files that are specified in your .gitignore. You can also create a .codebuffignore file to specify additional files or folders to ignore.',
  },
  {
    question: 'How does Codebuff work?',
    answer:
      'Codebuff runs specialized models in parallel: one finds files, another reasons through the problem, another writes code, another reviews. A selector picks the best output. In Max mode, multiple implementations compete.',
  },
  {
    question: 'How does Codebuff compare to Claude Code?',
    answer:
      'Codebuff is faster, cheaper, and handles large codebases better. See the detailed comparison in our documentation.',
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
