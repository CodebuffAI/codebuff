'use client'

import { notFound } from 'next/navigation'
import { getDocsByCategory } from '@/lib/docs'
import dynamic from 'next/dynamic'
import { useMDXComponent } from 'next-contentlayer/hooks'
import { Check, Link } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Doc } from '@/types/docs'

interface CategoryPageProps {
  params: {
    category: string
  }
}

const DocPage = ({ doc, components }: { doc: Doc; components: any }) => {
  const MDXContent = useMDXComponent(doc.body.code)
  return (
    <article className="prose dark:prose-invert prose-compact">
      <MDXContent components={components} />
    </article>
  )
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const docs = getDocsByCategory(params.category)

  if (!docs.length) {
    return notFound()
  }

  const components = {
    CodeDemo: dynamic(() =>
      import('@/components/docs/mdx/code-demo').then((mod) => mod.CodeDemo)
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
            className="inline-block hover:cursor-pointer hover:underline -mb-4"
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
    <div className="max-w-3xl mx-auto space-y-24">
      {sortedDocs.map((doc) => (
        <DocPage key={doc.slug} doc={doc} components={components} />
      ))}
    </div>
  )
}
