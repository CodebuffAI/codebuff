'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getDocsByCategory } from '@/lib/docs'

const sections = [
  {
    title: 'Help & FAQ',
    href: '/docs/help',
    subsections: getDocsByCategory('help').map((doc) => ({
      title: doc.title,
      href: `/docs/help/${doc.slug}`,
    })),
  },
  {
    title: 'Tips & Tricks',
    href: '/docs/tips',
    subsections: getDocsByCategory('tips').map((doc) => ({
      title: doc.title,
      href: `/docs/tips/${doc.slug}`,
    })),
  },
  {
    title: 'Project Showcase',
    href: '/docs/showcase',
    subsections: getDocsByCategory('showcase').map((doc) => ({
      title: doc.title,
      href: `/docs/showcase/${doc.slug}`,
    })),
  },
  {
    title: 'Case Studies',
    href: '/docs/case-studies',
    subsections: getDocsByCategory('case-studies').map((doc) => ({
      title: doc.title,
      href: `/docs/case-studies/${doc.slug}`,
    })),
  },
]

export function DocSidebar({ className }: { className?: string }) {
  const pathname = usePathname()

  return (
    <nav className={cn('space-y-4', className)}>
      {sections.map((section) => (
        <div key={section.href}>
          <Link
            href={section.href}
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
                    // If we're on the same page, scroll instead of navigate
                    if (pathname.startsWith(section.href)) {
                      e.preventDefault()
                      const id = subsection.title
                        .toLowerCase()
                        .replace(/\s+/g, '-')
                      document
                        .getElementById(id)
                        ?.scrollIntoView({ behavior: 'smooth' })
                    }
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
