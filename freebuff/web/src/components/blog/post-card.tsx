import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

import { getAuthor } from '@/lib/blog/authors'
import { blogConfig } from '@/lib/blog/config'
import { formatShortDate } from '@/lib/blog/format-date'

import { AuthorAvatar } from './author-avatar'

import type { PostMeta } from '@/lib/blog/types'

interface PostCardProps {
  post: PostMeta
  /** Use a more spacious layout for the editor's pick slot. */
  variant?: 'default' | 'featured'
}

/**
 * Visually distinct accent per category so the index doesn't look like one
 * giant grid of identical cards.
 *
 * Static class strings so Tailwind's JIT picks them up.
 */
const CATEGORY_STYLE: Record<
  string,
  { pill: string; accent: string; label: string }
> = {
  Launches: {
    pill: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    accent: 'from-amber-400/40 via-amber-400/0 to-transparent',
    label: 'Launches',
  },
  Comparisons: {
    pill: 'border-acid-matrix/40 bg-acid-matrix/[0.08] text-acid-matrix',
    accent: 'from-acid-matrix/40 via-acid-matrix/0 to-transparent',
    label: 'Comparisons',
  },
  Guides: {
    pill: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
    accent: 'from-cyan-400/40 via-cyan-400/0 to-transparent',
    label: 'Guides',
  },
  Research: {
    pill: 'border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200',
    accent: 'from-fuchsia-400/40 via-fuchsia-400/0 to-transparent',
    label: 'Research',
  },
  Engineering: {
    pill: 'border-lime-400/40 bg-lime-400/10 text-lime-200',
    accent: 'from-lime-400/40 via-lime-400/0 to-transparent',
    label: 'Engineering',
  },
  Community: {
    pill: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
    accent: 'from-rose-400/40 via-rose-400/0 to-transparent',
    label: 'Community',
  },
}

const FALLBACK_STYLE = CATEGORY_STYLE.Comparisons!

export function PostCard({ post, variant = 'default' }: PostCardProps) {
  const author = getAuthor(post.authorId)
  const date = formatShortDate(post.publishedAt)
  const href = `${blogConfig.basePath}/${post.slug}`
  const style = CATEGORY_STYLE[post.category] ?? FALLBACK_STYLE
  // Prefer the punchier subtitle for previews; fall back to the SEO description.
  const preview = post.subtitle ?? post.description

  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-all hover:border-acid-matrix/40 hover:bg-white/[0.04]"
    >
      {/* Top accent bar — color-coded per category. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${style.accent}`}
      />

      <div className="flex items-center justify-between text-xs">
        <span
          className={`rounded-full border px-2.5 py-1 font-mono uppercase tracking-wider ${style.pill}`}
        >
          {style.label}
        </span>
        <ArrowUpRight className="size-4 text-zinc-500 transition-colors group-hover:text-acid-matrix" />
      </div>

      <h3
        className={`font-serif font-medium text-white transition-colors group-hover:text-acid-matrix ${
          variant === 'featured'
            ? 'text-2xl leading-tight md:text-3xl'
            : 'text-xl leading-snug md:text-2xl'
        }`}
      >
        {post.title}
      </h3>

      <p className="line-clamp-3 text-[15px] leading-relaxed text-zinc-400">
        {preview}
      </p>

      <div className="mt-auto flex items-center gap-2.5 pt-2 text-xs text-zinc-500">
        <AuthorAvatar author={author} size="sm" />
        <span className="font-medium text-zinc-300">{author.name}</span>
        <span className="text-zinc-700">·</span>
        <time dateTime={post.publishedAt}>{date}</time>
        <span className="text-zinc-700">·</span>
        <span>{post.readingMinutes} min</span>
      </div>
    </Link>
  )
}
