import { NextResponse } from 'next/server'

import { GITHUB_REPO, GITHUB_REPO_URL } from '@/components/landing/nav-links'

export const runtime = 'nodejs'
export const revalidate = 3600

type GitHubRepoResponse = {
  stargazers_count?: number
  html_url?: string
}

export async function GET() {
  try {
    const headers: HeadersInit = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    const token = process.env.GITHUB_TOKEN
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers,
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      return NextResponse.json({
        stars: null,
        url: GITHUB_REPO_URL,
      })
    }

    const data = (await response.json()) as GitHubRepoResponse
    return NextResponse.json({
      stars:
        typeof data.stargazers_count === 'number' ? data.stargazers_count : null,
      url: data.html_url ?? GITHUB_REPO_URL,
    })
  } catch {
    return NextResponse.json({
      stars: null,
      url: GITHUB_REPO_URL,
    })
  }
}
