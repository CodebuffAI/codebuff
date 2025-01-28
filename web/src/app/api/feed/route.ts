import { NextResponse } from 'next/server'

export interface Article {
  title: string
  href: string
  description: string
  pubDate: string
  content: string
  thumbnail: string
}

export async function GET() {
  try {
    const res = await fetch('https://news.codebuff.com/feed')
    const text = await res.text()

    // Parse XML string directly
    const items = text.match(/<item>[\s\S]*?<\/item>/g) || []

    const articles: Article[] = items.map((item) => ({
      title: item.match(/<title>\s*<!\[CDATA\[(.*?)\]\]>/)?.[1] || '',
      href: item.match(/<link>(.*?)<\/link>/)?.[1] || '',
      description:
        item.match(/<description>\s*<!\[CDATA\[(.*?)\]\]>/)?.[1] || '',
      pubDate: item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '',
      content: item.match(/<content:encoded>\s*<!\[CDATA\[(.*?)\]\]>/)?.[1] || '',
      thumbnail: item.match(/<enclosure.*?url="([^"]*)".*?>/)?.[1] || '',
    }))

    return NextResponse.json({ articles })
  } catch (error) {
    console.error('Failed to fetch feed:', error)
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 })
  }
}
