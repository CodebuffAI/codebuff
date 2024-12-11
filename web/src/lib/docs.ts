import { allDocs } from '.contentlayer/generated'
import type { Doc } from '@/types/docs'

export function getDocsByCategory(category: string) {
  if (!allDocs) return []
  return (allDocs as Doc[])
    .filter((doc: Doc) => doc.category === category)
    .filter((doc: Doc) => !doc.slug.startsWith('_'))
    .sort((a: Doc, b: Doc) => (a.order ?? 0) - (b.order ?? 0))
}

// export function getAllCategories() {
//   if (!allDocs) return []
//   return Array.from(new Set((allDocs as Doc[]).map((doc: Doc) => doc.category)))
// }
