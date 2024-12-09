'use client'

import { notFound } from 'next/navigation'
import { getDocsByCategory } from '@/lib/docs'
import dynamic from 'next/dynamic'
import { useMDXComponent } from 'next-contentlayer/hooks'
import { Check, Link } from 'lucide-react'
import { useEffect, useState } from 'react'

interface CategoryPageProps {
  params: {
    category: string
  }
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
    h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const [copied, setCopied] = useState(false)

      useEffect(() => {
        if (copied) {
          setTimeout(() => setCopied(false), 2000)
        }
      }, [copied])

      return (
        <div className="group">
          <h1
            className="inline-block hover:cursor-pointer hover:underline -mb-4"
            onClick={() => {
              const id = children?.toString().toLowerCase().replace(/\s+/g, '-')
              if (id) {
                document
                  .getElementById(id)
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            }}
            id={children?.toString().toLowerCase().replace(/\s+/g, '-')}
          >
            {children}
            <button
              onClick={() => {
                const url = `${window.location.pathname}#${children?.toString().toLowerCase().replace(/\s+/g, '-')}`
                window.navigator.clipboard.writeText(
                  window.location.origin + url
                )
                setCopied(true)
              }}
              className="opacity-0 group-hover:opacity-100 p-2 transition-opacity"
              aria-label="Copy link to section"
            >
              {copied ? <Check className="text-green-500" /> : <Link />}
            </button>
          </h1>
        </div>
      )
    },
  }

  return (
    <div className="max-w-3xl mx-auto space-y-24">
      {sortedDocs.map((doc) => {
        const MDXContent = useMDXComponent(doc.body.code)
        return (
          <article
            key={doc.slug}
            className="prose dark:prose-invert prose-compact"
          >
            <MDXContent components={components} />
          </article>
        )
      })}
    </div>
  )
}
