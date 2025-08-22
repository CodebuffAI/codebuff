'use client'

import dynamic from 'next/dynamic'
import NextLink from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import type { Doc } from '@/types/docs'

import { sections } from '@/components/docs/doc-sidebar'
import { Mdx } from '@/components/docs/mdx/mdx-components'
import { getDocsByCategory } from '@/lib/docs'

const DocNavigation = ({ category }: { category: string }) => {
  const currentIndex = sections.findIndex((s) => s.href === `/docs/${category}`)
  const prevSection = currentIndex > 0 ? sections[currentIndex - 1] : null
  const nextSection =
    currentIndex < sections.length - 1 ? sections[currentIndex + 1] : null

  return (
    <div className="flex justify-between items-center pt-8 mt-8 border-t">
      {prevSection && (
        <NextLink
          href={prevSection.href}
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
          <span className="font-medium">{prevSection.title}</span>
        </NextLink>
      )}
      {nextSection && (
        <NextLink
          href={nextSection.href}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors ml-auto"
        >
          <span className="font-medium">{nextSection.title}</span>
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

interface CategoryPageProps {
  params: { category: string }
}

const DocPage = ({ doc }: { doc: Doc }) => {
  return (
    <article className="prose dark:prose-invert prose-compact [&_h1]:scroll-mt-24 [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24 max-w-none overflow-x-auto">
      <Mdx code={doc.body.code} />

      {React.createElement(
        dynamic(() =>
          import(`@/content/${doc.category}/_cta.mdx`).catch(() => () => null)
        )
      )}
    </article>
  )
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const docs = getDocsByCategory(params.category)

  if (!docs.length) {
    return notFound()
  }

  // Sort by order field
  const sortedDocs = [...docs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return (
    <div className="max-w-3xl mx-auto grid divide-y divide-border [&>*]:py-12 first:[&>*]:pt-0 last:[&>*]:pb-0">
      {sortedDocs.map((doc) => (
        <DocPage key={doc.slug} doc={doc} />
      ))}

      <DocNavigation category={params.category} />
    </div>
  )
}
