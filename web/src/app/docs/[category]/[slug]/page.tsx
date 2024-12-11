'use client'

import { notFound } from 'next/navigation'
import dynamic from 'next/dynamic'
import { TableOfContents } from '@/components/docs/toc'
import { allDocs } from '.contentlayer/generated'
import { useMDXComponent } from 'next-contentlayer/hooks'
import type { Doc } from '@/types/docs'

interface DocPageProps {
  params: {
    category: string
    slug: string
  }
}

export default function DocPage({ params }: DocPageProps) {
  const doc = (allDocs as Doc[]).find(
    (doc: Doc) => doc.category === params.category && doc.slug === params.slug
  )
  console.log('doc?.slug', doc?.slug)

  const MDXContent = useMDXComponent(doc?.body.code ?? '')
  const CtaContent = useMDXComponent(doc?.ctaContent ?? '')
  if (!doc) {
    return notFound()
  }

  const components = {
    CodeDemo: dynamic(() =>
      import('@/components/docs/mdx/code-demo').then((mod) => mod.CodeDemo)
    ),
  }

  return (
    <div className="max-w-3xl mx-auto">
      <article className="prose dark:prose-invert">
        {!doc.slug.startsWith('_') && <MDXContent components={components} />}
        {doc.ctaContent && (
          <div className="mt-12 border-t pt-8">
            <CtaContent />
          </div>
        )}
      </article>
    </div>
  )
}
