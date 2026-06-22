'use client'

import { BookOpen } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/vly/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { GitHubStarLink } from './GitHubStarLink'
import { DiscordIcon } from './icons'
import { BLOG_PATH, DISCORD_URL } from './nav-links'

const iconButtonClass =
  'flex items-center rounded-md p-2 text-white/50 transition-colors hover:text-white'

export function NavSocialLinks({
  hideOnMobile = false,
}: {
  hideOnMobile?: boolean
}) {
  const pathname = usePathname()
  const onBlog = pathname === BLOG_PATH || pathname?.startsWith(`${BLOG_PATH}/`)

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          'items-center gap-0.5 sm:gap-1',
          hideOnMobile ? 'hidden sm:flex' : 'flex',
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={BLOG_PATH}
              aria-label="Blog"
              aria-current={onBlog ? 'page' : undefined}
              className={cn(
                iconButtonClass,
                onBlog && 'text-white',
              )}
            >
              <BookOpen className="h-[18px] w-[18px]" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">Blog</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              className={iconButtonClass}
            >
              <DiscordIcon className="h-[18px] w-[18px]" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom">Discord</TooltipContent>
        </Tooltip>

        <GitHubStarLink hideOnMobile={hideOnMobile} />
      </div>
    </TooltipProvider>
  )
}
