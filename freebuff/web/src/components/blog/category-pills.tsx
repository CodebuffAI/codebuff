'use client'

import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import { PostCard } from './post-card'

import type { PostMeta } from '@/lib/blog/types'

interface FilterableGridProps {
  posts: PostMeta[]
  categories: readonly string[]
}

/**
 * Index list with a sticky category pill bar.
 *
 * Kept client-side so filtering does not require a roundtrip. The full list
 * is still rendered as raw HTML below the pills so search engines and AI
 * crawlers see every post link.
 */
export function FilterableGrid({ posts, categories }: FilterableGridProps) {
  const [active, setActive] = useState<string>('All')

  const filtered = useMemo(() => {
    if (active === 'All') return posts
    return posts.filter((p) => p.category === active)
  }, [active, posts])

  const counts = useMemo(() => {
    const map: Record<string, number> = { All: posts.length }
    for (const p of posts) map[p.category] = (map[p.category] ?? 0) + 1
    return map
  }, [posts])

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((cat) => {
          const isActive = active === cat
          const count = counts[cat] ?? 0
          return (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm transition-colors',
                isActive
                  ? 'bg-acid-matrix text-black'
                  : 'border border-white/10 bg-white/[0.02] text-zinc-300 hover:border-acid-matrix/40 hover:text-white',
              )}
              aria-pressed={isActive}
            >
              {cat}
              <span
                className={cn(
                  'ml-2 text-xs',
                  isActive ? 'text-black/60' : 'text-zinc-500',
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-zinc-500">
          No posts in this category yet — check back soon.
        </p>
      )}
    </div>
  )
}
