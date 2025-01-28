import { allDocs } from '.contentlayer/generated'
import { Article } from '@/app/api/feed/route'
import type { Doc } from '@/types/docs'

export function getDocsByCategory(category: string) {
  if (!allDocs) return []
  return (allDocs as Doc[])
    .filter((doc: Doc) => doc.category === category)
    .filter((doc: Doc) => !doc.slug.startsWith('_'))
    .sort((a: Doc, b: Doc) => (a.order ?? 0) - (b.order ?? 0))
}

export interface NewsArticle {
  title: string
  href: string
  external: boolean
}

export async function getNewsArticles(): Promise<NewsArticle[]> {
  try {
    const res = await fetch('/api/feed')
    const { articles }: { articles: Article[] } = await res.json()
    return articles.map((article) => ({
      title: article.title,
      href: article.href,
      external: true,
    }))
  } catch (error) {
    console.error('Failed to fetch news articles:', error)
    return []
  }
}

// export function getAllCategories() {
//   if (!allDocs) return []
//   return Array.from(new Set((allDocs as Doc[]).map((doc: Doc) => doc.category)))
// }
