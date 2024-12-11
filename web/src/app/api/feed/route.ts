import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch('https://news.codebuff.com/feed')
    const text = await res.text()
    return NextResponse.json({ feed: text })
  } catch (error) {
    console.error('Failed to fetch feed:', error)
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 })
  }
}
