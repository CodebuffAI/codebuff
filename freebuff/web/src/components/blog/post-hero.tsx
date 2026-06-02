import Link from 'next/link'

import { getAuthor } from '@/lib/blog/authors'
import { blogConfig } from '@/lib/blog/config'
import { formatLongDate } from '@/lib/blog/format-date'

import { AuthorAvatar } from './author-avatar'

import type { PostMeta } from '@/lib/blog/types'

export function PostHero({ post }: { post: PostMeta }) {
  const author = getAuthor(post.authorId)
  const coAuthors = (post.coAuthorIds ?? []).map(getAuthor)
  const published = formatLongDate(post.publishedAt)
  const updated = post.updatedAt ? formatLongDate(post.updatedAt) : null

  return (
    <header className="space-y-7 border-b border-white/10 pb-10">
      <div className="flex items-center gap-3 text-sm">
        <Link
          href={blogConfig.basePath}
          className="text-zinc-500 hover:text-white"
        >
          ← Back to blog
        </Link>
        <span className="text-zinc-700">·</span>
        <span className="rounded-full border border-acid-matrix/30 bg-acid-matrix/[0.06] px-2.5 py-0.5 font-mono text-xs uppercase tracking-wider text-acid-matrix">
          {post.category}
        </span>
      </div>

      <h1 className="font-serif text-4xl font-medium leading-[1.1] text-white md:text-5xl lg:text-6xl">
        {post.title}
      </h1>

      {post.subtitle && (
        <p className="text-lg leading-relaxed text-zinc-400 md:text-xl">
          {post.subtitle}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <div className="flex items-center gap-3">
          {[author, ...coAuthors].map((a, i) => (
            <div key={a.id} className="flex items-center gap-2.5">
              <AuthorAvatar author={a} size="md" />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-white">
                  {a.name}
                </span>
                {a.role && (
                  <span className="text-xs text-zinc-500">{a.role}</span>
                )}
              </div>
              {i < coAuthors.length && (
                <span className="text-zinc-700">·</span>
              )}
            </div>
          ))}
        </div>
        <span className="text-zinc-700">·</span>
        <time
          dateTime={post.publishedAt}
          className="text-sm text-zinc-400"
        >
          {published}
        </time>
        <span className="text-zinc-700">·</span>
        <span className="text-sm text-zinc-400">
          {post.readingMinutes} min read
        </span>
        {updated && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-sm text-zinc-500">Updated {updated}</span>
          </>
        )}
      </div>
    </header>
  )
}
