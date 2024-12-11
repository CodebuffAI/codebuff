import { allDocs } from '.contentlayer/generated'
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
    const res = await fetch('https://news.codebuff.com/feed')
    const text = await res.text()
    // Parse XML string directly without DOMParser
    const items = text.match(/<item>[\s\S]*?<\/item>/g) || []

    return items.map((item) => {
      const title = item.match(/<title>\s*<!\[CDATA\[(.*?)\]\]>/)?.[1] || ''
      const href = item.match(/<link>(.*?)<\/link>/)?.[1] || ''
      return {
        title,
        href,
        external: true,
      }
    })
  } catch (error) {
    console.error('Failed to fetch news articles:', error)
    return []
  }
}

// export function getAllCategories() {
//   if (!allDocs) return []
//   return Array.from(new Set((allDocs as Doc[]).map((doc: Doc) => doc.category)))
// }
