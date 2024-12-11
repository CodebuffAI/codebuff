import { allDocs } from '.contentlayer/generated'
import type { Doc } from '@/types/docs'

export function getDocsByCategory(category: string) {
  if (!allDocs) return []
  return (allDocs as Doc[])
    .filter((doc: Doc) => doc.category === category)
    .filter((doc: Doc) => !doc.slug.startsWith('_'))
    .sort((a: Doc, b: Doc) => (a.order ?? 0) - (b.order ?? 0))
}

export async function getNewsArticles() {
  try {
    const res = await fetch('https://news.codebuff.com/feed')
    const text = await res.text()
    const parser = new DOMParser()
    const xml = parser.parseFromString(text, 'text/xml')
    const items = xml.querySelectorAll('item')
    
    return Array.from(items).map(item => ({
      title: item.querySelector('title')?.textContent?.replace('<![CDATA[', '').replace(']]>', '') || '',
      href: item.querySelector('link')?.textContent || '',
      external: true
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
