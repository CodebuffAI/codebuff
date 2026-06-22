'use client'

import { Star } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/vly/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { GitHubIcon } from './icons'
import { GITHUB_REPO, GITHUB_REPO_URL } from './nav-links'

function formatStarCount(count: number): string {
  if (count >= 10_000) {
    return `${Math.round(count / 1000)}k`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return count.toLocaleString()
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

async function fetchStarsFromShields(): Promise<number | null> {
  const response = await fetch(
    `https://img.shields.io/github/stars/${GITHUB_REPO}.json`,
  )
  if (!response.ok) return null

  const data = (await response.json()) as { message?: string }
  if (typeof data.message !== 'string') return null

  return parseShieldsStarCount(data.message)
}

async function resolveStarCount(): Promise<number | null> {
  try {
    const response = await fetch('/api/github/stars')
    if (response.ok) {
      const data = (await response.json()) as { stars?: number | null }
      if (typeof data.stars === 'number') {
        return data.stars
      }
    }
  } catch {
    // Fall through to shields.io.
  }

  return fetchStarsFromShields()
}

export function GitHubStarLink({
  className,
  hideOnMobile = false,
}: {
  className?: string
  hideOnMobile?: boolean
}) {
  const [stars, setStars] = useState<number | null>(null)
  const repoUrl = GITHUB_REPO_URL

  useEffect(() => {
    let cancelled = false
    void resolveStarCount().then((count) => {
      if (!cancelled && count != null) {
        setStars(count)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={
            stars != null
              ? `Star Codebuff on GitHub (${formatStarCount(stars)} stars)`
              : 'Star Codebuff on GitHub'
          }
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-white/55 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white',
            hideOnMobile ? 'hidden sm:inline-flex' : 'inline-flex',
            className,
          )}
        >
          <GitHubIcon className="h-[16px] w-[16px] shrink-0" />
          <span className="text-xs font-medium tabular-nums">
            {stars != null ? formatStarCount(stars) : '…'}
          </span>
          <Star className="h-3 w-3 shrink-0 fill-current opacity-80" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {stars != null
          ? `Star on GitHub · ${stars.toLocaleString()} stars`
          : 'Star on GitHub'}
      </TooltipContent>
    </Tooltip>
  )
}
