'use client'

import { Code, GraduationCap, Library } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
// NEWS DISABLED: Uncomment these imports when re-enabling news
// import { useEffect, useMemo, useState } from 'react'

// NEWS DISABLED: Uncomment to re-enable news in sidebar
// import type { NewsArticle } from '@/lib/docs'
// import { getDocsByCategory, getNewsArticles } from '@/lib/docs'
import { getDocsByCategory } from '@/lib/docs'
import { cn } from '@/lib/utils'

const learnSections = [
  {
    title: 'Getting Started',
    href: '/docs/help',
    subsections: getDocsByCategory('help').map((doc) => ({
      title: doc.title,
      href: `/docs/help/${doc.slug}`,
    })),
    external: false,
  },
  {
    title: 'Using Codebuff',
    href: '/docs/tips',
    subsections: getDocsByCategory('tips').map((doc) => ({
      title: doc.title,
      href: `/docs/tips/${doc.slug}`,
    })),
    external: false,
  },
]

const buildSections = [
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
]

const referenceSections = [
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

export const sectionGroups = [
  { label: 'Learn', icon: GraduationCap, sections: learnSections },
  { label: 'Build', icon: Code, sections: buildSections },
  { label: 'Reference', icon: Library, sections: referenceSections },
]

// Flat list of all sections for compatibility with layout.tsx
export const sections = [...learnSections, ...buildSections, ...referenceSections]

export function DocSidebar({
  className,
  onNavigate,
}: {
  className?: string
  onNavigate: () => void
}) {
  const pathname = usePathname()
  // NEWS DISABLED: Uncomment to re-enable news in sidebar
  // const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([])
  // const allSections = useMemo(
  //   () => [
  //     ...sections,
  //     {
  //       title: 'News',
  //       href: 'https://news.codebuff.com',
  //       external: true,
  //       subsections: newsArticles,
  //     },
  //   ],
  //   [newsArticles],
  // )
  // useEffect(() => {
  //   async function fetchNews() {
  //     const articles = await getNewsArticles()
  //     setNewsArticles(articles)
  //   }
  //   fetchNews()
  // }, [])
  return (
    <nav className={cn('space-y-6', className)}>
      {sectionGroups.map((group, groupIndex) => (
        <div key={group.label} className="space-y-3">
          {/* Group header */}
          <div
            className="px-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 select-none pointer-events-none"
          >
            <group.icon className="h-3.5 w-3.5" />
            {group.label}
          </div>

          {/* Sections within group */}
          <div className="space-y-4">
            {group.sections.map((section) => (
              <div key={section.href} className="space-y-1">
                <div
                  className="block px-3 py-2 text-sm font-medium select-none"
                >
                  {section.title}
                </div>
                {section.subsections && section.subsections.length > 0 && (
                  <div className="ml-4 space-y-1">
                    {section.subsections.map((subsection) => (
                      <Link
                        key={subsection.href}
                        href={subsection.href}
                        target={section.external ? '_blank' : undefined}
                        onClick={() => {
                          const sheet =
                            document.querySelector('[data-state="open"]')
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
          </div>
        </div>
      ))}
    </nav>
  )
}
