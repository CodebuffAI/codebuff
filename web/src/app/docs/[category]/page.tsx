import { redirect } from 'next/navigation'

import { getDocsByCategory } from '@/lib/docs'

interface CategoryPageProps {
  params: { category: string }
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const docs = getDocsByCategory(params.category)

  if (!docs.length) {
    redirect('/docs')
  }

  // Sort by order field and redirect to first doc
  const sortedDocs = [...docs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const firstDoc = sortedDocs[0]

  redirect(`/docs/${params.category}/${firstDoc.slug}`)
}
