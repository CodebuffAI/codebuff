'use client'

import { Feather } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/vly/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { DiscordIcon } from './icons'
import { BLOG_PATH, DISCORD_URL } from './nav-links'

const iconButtonClass =
  'flex items-center rounded-md p-1.5 text-white/50 transition-colors hover:text-white'

export function NavSocialLinks({
  hideOnMobile = false,
}: {
  hideOnMobile?: boolean
}) {
  const pathname = usePathname()
  const onBlog = pathname === BLOG_PATH || pathname?.startsWith(`${BLOG_PATH}/`)

  return (
    <div
      className={cn(
        'items-center gap-2.5 sm:gap-3',
        hideOnMobile ? 'hidden sm:flex' : 'flex',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={BLOG_PATH}
            aria-label="Blog"
            aria-current={onBlog ? 'page' : undefined}
            className={cn(iconButtonClass, onBlog && 'text-white')}
          >
            <Feather className="h-[17px] w-[17px]" strokeWidth={1.75} />
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
    </div>
  )
}
