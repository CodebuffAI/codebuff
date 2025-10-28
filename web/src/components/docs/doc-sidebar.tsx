'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import type { NewsArticle } from '@/lib/docs'

import { getDocsByCategory, getNewsArticles } from '@/lib/docs'
import { cn } from '@/lib/utils'

export const sections = [
  {
    title: 'Intro',
    href: '/docs/help',
    subsections: getDocsByCategory('help').map((doc) => ({
      title: doc.title,
      href: `/docs/help/${doc.slug}`,
    })),
    external: false,
  },
  {
    title: 'Tips & Tricks',
    href: '/docs/tips',
    subsections: getDocsByCategory('tips').map((doc) => ({
      title: doc.title,
      href: `/docs/tips/${doc.slug}`,
    })),
    external: false,
  },
  {
    title: 'Agents',
    href: '/docs/agents',
    subsections: getDocsByCategory('agents').map((doc) => ({
      title: doc.title,
      href: `/docs/agents/${doc.slug}`,
    })),
    external: false,
  },
  {
    title: 'Walkthroughs',
    href: '/docs/walkthroughs',
    subsections: getDocsByCategory('walkthroughs').map((doc) => ({
      title: doc.title,
      href: `/docs/walkthroughs/${doc.slug}`,
    })),
    external: false,
  },
  {
    title: 'Advanced',
    href: '/docs/advanced',
    subsections: getDocsByCategory('advanced').map((doc) => ({
      title: doc.title,
      href: `/docs/advanced/${doc.slug}`,
    })),
    external: false,
  },
  {
    title: 'Case Studies',
    href: '/docs/case-studies',
    subsections: getDocsByCategory('case-studies').map((doc) => ({
      title: doc.title,
      href: `/docs/case-studies/${doc.slug}`,
    })),
    external: false,
  },
]

export function DocSidebar({
  className,
  onNavigate,
}: {
  className?: string
  onNavigate: () => void
}) {
  const pathname = usePathname()
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([])

  const allSections = useMemo(
    () => [
      ...sections,
      {
        title: 'News',
        href: 'https://news.codebuff.com',
        external: true,
        subsections: newsArticles,
      },
    ],
    [newsArticles],
  )

  useEffect(() => {
    async function fetchNews() {
      const articles = await getNewsArticles()
      setNewsArticles(articles)
    }

    fetchNews()
  }, [])

  return (
    <nav className={cn('space-y-6', className)}>
      {allSections.map((section) => (
        <div key={section.href} className="space-y-2">
          <Link
            href={section.href}
            target={section.external ? '_blank' : undefined}
            onClick={() => {
              const sheet = document.querySelector('[data-state="open"]')
              if (sheet) sheet.setAttribute('data-state', 'closed')
              onNavigate?.()
            }}
            className={cn(
              'block px-3 py-2 hover:bg-accent rounded-md transition-all text-sm font-medium',
              pathname === section.href && 'bg-accent text-accent-foreground',
            )}
          >
            {section.title}
          </Link>
          {section.subsections && section.subsections.length > 0 && (
            <div className="ml-4 space-y-1">
              {section.subsections.map((subsection) => (
                <Link
                  key={subsection.href}
                  href={subsection.href}
                  target={section.external ? '_blank' : undefined}
                  onClick={() => {
                    const sheet = document.querySelector('[data-state="open"]')
                    if (sheet) sheet.setAttribute('data-state', 'closed')
                    onNavigate?.()
                  }}
                  className={cn(
                    'block w-full text-left px-3 py-1.5 text-sm hover:bg-accent rounded-md transition-all text-muted-foreground hover:text-foreground',
                    pathname === subsection.href &&
                      'bg-accent text-accent-foreground',
                  )}
                >
                  {subsection.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
