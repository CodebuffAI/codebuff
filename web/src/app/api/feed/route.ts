import { NextResponse } from 'next/server'
import { z } from 'zod'

const SubstackPostSchema = z.object({
  title: z.string(),
  canonical_url: z.string().url(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  post_date: z.string(),
  body_html: z.string().optional(),
  cover_image: z.string().url().optional(),
})

const SubstackResponseSchema = z.array(SubstackPostSchema)

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
    const res = await fetch('https://news.codebuff.com/api/v1/posts')
    const data = await res.json()

    // Validate response data
    const posts = SubstackResponseSchema.parse(data)

    const articles: Article[] = posts.map((post) => ({
      title: post.title,
      href: post.canonical_url,
      description: post.subtitle || post.description || '',
      pubDate: post.post_date,
      content: post.body_html || '',
      thumbnail: post.cover_image || '',
    }))

    return NextResponse.json({ articles })
  } catch (error) {
    console.error('Failed to fetch feed:', error)
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 })
  }
}
