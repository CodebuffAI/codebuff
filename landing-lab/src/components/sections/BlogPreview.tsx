import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { useState } from 'react'

import { Parallax } from '@/components/Parallax'
import { cn } from '@/lib/utils'

type Post = {
  slug: string
  title: string
  category: string
  color: string
  subtitle: string
  date: string
  read: string
}

const BLOG_BASE = 'https://freebuff.com/blog'

// Real posts from the Freebuff blog (freebuff.com/blog).
const POSTS: Post[] = [
  {
    slug: 'freebuff-launch',
    title: 'Introducing Freebuff: the free coding agent',
    category: 'Launches',
    color: '#54a967',
    subtitle: 'No subscription. No configuration. Start in seconds.',
    date: 'Feb 12, 2026',
    read: '6 min',
  },
  {
    slug: 'freebuff-web-launch',
    title: 'Introducing Freebuff Web: free, instant full-stack apps',
    category: 'Launches',
    color: '#54a967',
    subtitle: 'Type one prompt. Get a working full-stack app, deployed, free.',
    date: 'Mar 8, 2026',
    read: '7 min',
  },
  {
    slug: 'free-alternative-to-claude-code',
    title: 'The free alternative to Claude Code',
    category: 'Comparisons',
    color: '#d97757',
    subtitle: 'Same CLI agent loop. Different bill.',
    date: 'Mar 17, 2026',
    read: '8 min',
  },
  {
    slug: 'free-alternative-to-cursor',
    title: 'The free alternative to Cursor',
    category: 'Comparisons',
    color: '#60a5fa',
    subtitle: 'A free CLI coding agent with subagents that pairs with any editor.',
    date: 'Mar 21, 2026',
    read: '7 min',
  },
  {
    slug: 'best-free-cli-coding-agents-2026',
    title: 'The best free CLI coding agents in 2026',
    category: 'Guides',
    color: '#fbbf24',
    subtitle: 'Eight CLI coding agents you can use today without paying — ranked.',
    date: 'Apr 1, 2026',
    read: '12 min',
  },
  {
    slug: 'state-of-free-ai-coding-2026',
    title: 'The state of free AI coding in 2026',
    category: 'Research',
    color: '#a78bfa',
    subtitle:
      'Frontier models got cheap. Coding agents got free. Here is what that changes.',
    date: 'Apr 8, 2026',
    read: '10 min',
  },
]

// Unique categories, in first-seen order, with an "All" tab up front.
const CATEGORIES = [
  'All',
  ...POSTS.reduce<string[]>((acc, p) => {
    if (!acc.includes(p.category)) acc.push(p.category)
    return acc
  }, []),
]

export function BlogPreview() {
  const [active, setActive] = useState('All')
  const posts = (
    active === 'All' ? POSTS : POSTS.filter((p) => p.category === active)
  ).slice(0, 3)

  return (
    <section id="blog" className="relative scroll-mt-24 bg-black px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
              Freeblog
            </p>
            <h2 className="font-serif text-2xl text-white md:text-[28px]">
              From the blog
            </h2>
          </div>
          <a
            href={BLOG_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1.5 text-sm text-white/55 transition-colors hover:text-white"
          >
            View all posts
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>

        {/* Horizontal category tabs */}
        <div className="mb-9 flex flex-wrap gap-2 border-b border-white/[0.08] pb-px">
          {CATEGORIES.map((cat) => {
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

        <Parallax from={-36} to={36} className="grid gap-6 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {posts.map((p, i) => (
              <motion.a
                key={p.slug}
                layout
                href={`${BLOG_BASE}/${p.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, delay: i * 0.06 }}
                className="group flex min-h-[280px] flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.02] p-8 transition-colors hover:border-forest/40 hover:bg-white/[0.04]"
              >
                <div>
                  <span
                    className="w-fit rounded-full px-3 py-1 text-xs font-normal"
                    style={{ backgroundColor: `${p.color}22`, color: p.color }}
                  >
                    {p.category}
                  </span>
                  <h3 className="mt-6 font-serif text-[28px] leading-[1.15] text-white transition-colors group-hover:text-forest-bright">
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
            ))}
          </AnimatePresence>
        </Parallax>
      </div>
    </section>
  )
}
