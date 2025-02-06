'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getDocsByCategory, getNewsArticles, NewsArticle } from '@/lib/docs'
import { useEffect, useMemo, useState } from 'react'

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
    title: 'Advanced',
    href: '/docs/advanced',
    subsections: getDocsByCategory('advanced').map((doc) => ({
      title: doc.title,
      href: `/docs/advanced/${doc.slug}`,
    })),
    external: false,
  },
  {
    title: 'Project Showcase',
    href: '/docs/showcase',
    subsections: getDocsByCategory('showcase').map((doc) => ({
      title: doc.title,
      href: `/docs/showcase/${doc.slug}`,
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
    [newsArticles]
  )

  useEffect(() => {
    async function fetchNews() {
      const articles = await getNewsArticles()
      setNewsArticles(articles)
    }

    fetchNews()
  }, [])

  return (
    <nav className={cn('space-y-4', className)}>
      {allSections.map((section) => (
        <div key={section.href}>
          <Link
            href={section.href}
            target={section.external ? '_blank' : undefined}
            onClick={() => {
              const sheet = document.querySelector('[data-state="open"]')
              if (sheet) sheet.setAttribute('data-state', 'closed')
            }}
            className={cn(
              'block px-3 py-2 hover:bg-accent rounded-md transition-colors',
              pathname === section.href && 'bg-accent'
            )}
          >
            {section.title}
          </Link>
          {section.subsections && section.subsections.length > 0 && (
            <div className="ml-2 mt-1 space-y-1">
              {section.subsections.map((subsection) => (
                <Link
                  key={subsection.href}
                  href={
                    section.external
                      ? subsection.href
                      : `${section.href}#${subsection.title.toLowerCase().replace(/\s+/g, '-')}`
                  }
                  target={section.external ? '_blank' : undefined}
                  onClick={(e) => {
                    onNavigate?.()
                    // If we're on the same page, scroll instead of navigate
                    if (pathname.startsWith(section.href)) {
                      e.preventDefault()
                      const id = subsection.title
                        .toLowerCase()
                        .replace(/\s+/g, '-')
                      document
                        .getElementById(id)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })

                      history.replaceState(null, '', `#${id}`)
                    }
                    // Close sheet after navigation
                    const sheet = document.querySelector('[data-state="open"]')
                    if (sheet) sheet.setAttribute('data-state', 'closed')
                    onNavigate?.()
                  }}
                  className={cn(
                    'block w-full text-left px-3 py-1 text-sm hover:bg-accent rounded-md transition-colors text-muted-foreground',
                    pathname === subsection.href && 'bg-accent'
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
