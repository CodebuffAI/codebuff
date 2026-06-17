'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

export type BlogPostPreview = {
  slug: string
  title: string
  category: string
  subtitle: string
  date: string
  read: string
}

const BLOG_BASE = '/blog'

// Category → accent color for the pill + hover, matching the prototype palette.
const CATEGORY_COLORS: Record<string, string> = {
  Launches: '#54a967',
  Comparisons: '#60a5fa',
  Guides: '#fbbf24',
  Research: '#a78bfa',
  Engineering: '#22d3ee',
  Community: '#f472b6',
}
const DEFAULT_COLOR = '#54a967'

export function BlogPreview({ posts }: { posts: BlogPostPreview[] }) {
  const categories = useMemo(
    () => [
      'All',
      ...posts.reduce<string[]>((acc, p) => {
        if (!acc.includes(p.category)) acc.push(p.category)
        return acc
      }, []),
    ],
    [posts],
  )

  const [active, setActive] = useState('All')
  const visible = (
    active === 'All' ? posts : posts.filter((p) => p.category === active)
  ).slice(0, 3)

  return (
    <section id="blog" className="relative scroll-mt-24 bg-black px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
              Freeblog
            </p>
            <h2 className="lp-serif text-2xl text-white md:text-[28px]">
              From the blog
            </h2>
          </div>
          <a
            href={BLOG_BASE}
            className="group flex items-center gap-1.5 text-sm text-white/55 transition-colors hover:text-white"
          >
            View all posts
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>

        {/* Horizontal category tabs */}
        <div className="mb-9 flex flex-wrap gap-2 border-b border-white/[0.08] pb-px">
          {categories.map((cat) => {
            const isActive = cat === active
            return (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={cn(
                  'relative px-3.5 py-2.5 text-sm font-normal transition-colors',
                  isActive ? 'text-white' : 'text-white/45 hover:text-white/80',
                )}
              >
                {cat}
                {isActive && (
                  <motion.span
                    layoutId="blog-tab-underline"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-forest-bright"
                  />
                )}
              </button>
            )
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visible.map((p, i) => {
              const color = CATEGORY_COLORS[p.category] ?? DEFAULT_COLOR
              return (
                <motion.a
                  key={p.slug}
                  layout
                  href={`${BLOG_BASE}/${p.slug}`}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                  className="group flex min-h-[280px] flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.02] p-8 transition-colors hover:border-forest/40 hover:bg-white/[0.04]"
                >
                  <div>
                    <span
                      className="w-fit rounded-full px-3 py-1 text-xs font-normal"
                      style={{ backgroundColor: `${color}22`, color }}
                    >
                      {p.category}
                    </span>
                    <h3 className="mt-6 lp-serif text-[28px] leading-[1.15] text-white transition-colors group-hover:text-forest-bright">
                      {p.title}
                    </h3>
                    <p className="mt-4 line-clamp-2 text-[15px] leading-relaxed text-white/50">
                      {p.subtitle}
                    </p>
                  </div>
                  <div className="mt-8 flex items-center justify-between text-xs text-white/35">
                    <span>
                      {p.date} · {p.read} read
                    </span>
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-forest-bright" />
                  </div>
                </motion.a>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
