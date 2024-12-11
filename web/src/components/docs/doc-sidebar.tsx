'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getDocsByCategory } from '@/lib/docs'

export const sections = [
  {
    title: 'Help & FAQ',
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
  {
    title: 'News',
    href: 'https://news.codebuff.com',
    external: true,
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

  return (
    <nav className={cn('space-y-4', className)}>
      {sections.map((section) => (
        <div key={section.href}>
          <Link
            href={section.href}
            onClick={() => {
              const sheet = document.querySelector('[data-state="open"]')
              if (sheet) sheet.setAttribute('data-state', 'closed')
            }}
            target={section.external ? '_blank' : undefined}
            className={cn(
              'block px-3 py-2 hover:bg-accent rounded-md transition-colors',
              pathname === section.href && 'bg-accent'
            )}
          >
            {section.title}
          </Link>
          {section.subsections && section.subsections.length > 0 && (
            <div className="ml-4 mt-1 space-y-1">
              {section.subsections.map((subsection) => (
                <Link
                  key={subsection.href}
                  href={`${section.href}#${subsection.title.toLowerCase().replace(/\s+/g, '-')}`}
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
                        ?.scrollIntoView({ behavior: 'smooth' })
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
