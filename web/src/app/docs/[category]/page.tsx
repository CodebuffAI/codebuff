'use client'

import React from 'react'
import { notFound } from 'next/navigation'
import { getDocsByCategory } from '@/lib/docs'
import dynamic from 'next/dynamic'
import { useMDXComponent } from 'next-contentlayer/hooks'
import { Check, Link } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Doc } from '@/types/docs'
import { sections } from '@/components/docs/doc-sidebar'
import NextLink from 'next/link'

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

const DocPage = ({ doc, components }: { doc: Doc; components: any }) => {
  const MDXContent = useMDXComponent(doc.body.code)

  return (
    <article className="prose dark:prose-invert prose-compact [&_h1]:scroll-mt-24 [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24">
      <MDXContent components={components} />

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

  const components = {
    CodeDemo: dynamic(() =>
      import('@/components/docs/mdx/code-demo').then((mod) => mod.CodeDemo)
    ),
    MarkdownTable: dynamic(() =>
      import('@/components/docs/mdx/markdown-table').then(
        (mod) => mod.MarkdownTable
      )
    ),
    a: dynamic(() =>
      import('@/components/docs/mdx/custom-link').then((mod) => mod.CustomLink)
    ),
    h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [copied, setCopied] = useState(false)

      // eslint-disable-next-line react-hooks/rules-of-hooks
      useEffect(() => {
        if (copied) {
          setTimeout(() => setCopied(false), 2000)
        }
      }, [copied])

      const title = children?.toString()
      const id = title?.toLowerCase().replace(/\s+/g, '-')
      if (!title) return <></>

      return (
        <div className="group">
          <h1
            className="inline-block hover:cursor-pointer hover:underline -mb-4 scroll-mt-24 font-serif"
            onClick={() => {
              if (id) {
                document
                  .getElementById(id)
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            }}
            id={id}
          >
            {title}
            <button
              onClick={() => {
                const url = `${window.location.pathname}#${id}`
                window.navigator.clipboard.writeText(
                  window.location.origin + url
                )
                setCopied(true)
              }}
              className="xs:opacity-100 xl:opacity-0 group-hover:opacity-100 p-2 rounded-full transition-opacity duration-300 ease-in-out"
              aria-label="Copy link to section"
            >
              {copied ? (
                <Check className="text-green-500 h-5 w-5" />
              ) : (
                <Link className="h-5 w-5" />
              )}
            </button>
          </h1>
        </div>
      )
    },
  }

  return (
    <div className="max-w-3xl mx-auto grid divide-y divide-border [&>*]:py-12 first:[&>*]:pt-0 last:[&>*]:pb-0">
      {sortedDocs.map((doc) => (
        <DocPage key={doc.slug} doc={doc} components={components} />
      ))}

      <DocNavigation category={params.category} />
    </div>
  )
}
