import { redirect } from 'next/navigation'

import { getDocsByCategory } from '@/lib/docs'

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
