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
import { GITHUB_REPO_URL } from './nav-links'

function formatStarCount(count: number): string {
  if (count >= 10_000) {
    return `${Math.round(count / 1000)}k`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return count.toLocaleString()
}

export function GitHubStarLink({
  className,
  hideOnMobile = false,
}: {
  className?: string
  hideOnMobile?: boolean
}) {
  const [stars, setStars] = useState<number | null>(null)
  const [repoUrl, setRepoUrl] = useState(GITHUB_REPO_URL)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/github/stars')
      .then((response) => response.json())
      .then((data: { stars?: number | null; url?: string }) => {
        if (cancelled) return
        if (typeof data.stars === 'number') {
          setStars(data.stars)
        }
        if (typeof data.url === 'string') {
          setRepoUrl(data.url)
        }
      })
      .catch(() => {})
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
            'items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-white/55 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white',
            hideOnMobile ? 'hidden sm:inline-flex' : 'inline-flex',
            className,
          )}
        >
          <GitHubIcon className="h-[16px] w-[16px] shrink-0" />
          <span className="text-xs font-medium tabular-nums">
            {stars != null ? formatStarCount(stars) : '—'}
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
