'use client'

import dynamic from 'next/dynamic'
import NextLink from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import type { Doc } from '@/types/docs'

import { Mdx } from '@/components/docs/mdx/mdx-components'
import { getDocsByCategory } from '@/lib/docs'
import { allDocs } from '.contentlayer/generated'

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

interface DocPageProps {
  params: { category: string; slug: string }
}

export default function DocPage({ params }: DocPageProps) {
  const docs = getDocsByCategory(params.category)
  const doc = docs.find((d: Doc) => d.slug === params.slug)

  if (!doc) {
    return notFound()
  }

  const sortedDocs = [...docs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return (
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
        category={params.category}
        currentSlug={params.slug}
      />
    </div>
  )
}
