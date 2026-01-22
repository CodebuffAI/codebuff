import { redirect } from 'next/navigation'

import { getDocsByCategory } from '@/lib/docs'
import { allDocs } from '.contentlayer/generated'

// Generate static params for all category pages at build time
export function generateStaticParams(): Array<{ category: string }> {
  const categories = new Set(
    allDocs
      .filter((doc) => !doc.slug.startsWith('_'))
      .map((doc) => doc.category),
  )
  return Array.from(categories).map((category) => ({ category }))
}

interface CategoryPageProps {
  params: Promise<{ category: string }>
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params
  const docs = getDocsByCategory(category)

  if (!docs.length) {
    redirect('/docs')
  }

  // Sort by order field and redirect to first doc
  const sortedDocs = [...docs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const firstDoc = sortedDocs[0]

  redirect(`/docs/${category}/${firstDoc.slug}`)
}
