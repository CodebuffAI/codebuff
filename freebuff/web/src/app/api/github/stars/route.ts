import { NextResponse } from 'next/server'

import { GITHUB_REPO, GITHUB_REPO_URL } from '@/components/landing/nav-links'

export const runtime = 'nodejs'
export const revalidate = 3600

type GitHubRepoResponse = {
  stargazers_count?: number
  html_url?: string
}

type ShieldsStarsResponse = {
  message?: string
}

function parseShieldsStarCount(message: string): number | null {
  const trimmed = message.trim()
  if (!trimmed) return null

  const normalized = trimmed.toLowerCase()
  if (normalized.endsWith('k')) {
    const value = Number.parseFloat(normalized.slice(0, -1))
    return Number.isFinite(value) ? Math.round(value * 1000) : null
  }
  if (normalized.endsWith('m')) {
    const value = Number.parseFloat(normalized.slice(0, -1))
    return Number.isFinite(value) ? Math.round(value * 1_000_000) : null
  }

  const digits = Number.parseInt(trimmed.replace(/,/g, ''), 10)
  return Number.isFinite(digits) ? digits : null
}

async function fetchStarsFromGitHub(): Promise<number | null> {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Freebuff-Web',
  }
  const token = process.env.GITHUB_TOKEN ?? process.env.CODEBUFF_GITHUB_TOKEN
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
    headers,
    next: { revalidate: 3600 },
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as GitHubRepoResponse
  return typeof data.stargazers_count === 'number' ? data.stargazers_count : null
}

async function fetchStarsFromShields(): Promise<number | null> {
  const response = await fetch(
    `https://img.shields.io/github/stars/${GITHUB_REPO}.json`,
    { next: { revalidate: 3600 } },
  )

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as ShieldsStarsResponse
  if (typeof data.message !== 'string') {
    return null
  }

  return parseShieldsStarCount(data.message)
}

export async function GET() {
  try {
    const stars =
      (await fetchStarsFromGitHub()) ?? (await fetchStarsFromShields())

    return NextResponse.json({
      stars,
      url: GITHUB_REPO_URL,
    })
  } catch {
    return NextResponse.json({
      stars: null,
      url: GITHUB_REPO_URL,
    })
  }
}
