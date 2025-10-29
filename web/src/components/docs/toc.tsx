'use client'

import { useEffect, useState } from 'react'

interface TocHeading {
  id: string
  text: string
  level: number
}

export function TableOfContents() {
  const [headings, setHeadings] = useState<TocHeading[]>([])
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll('h2, h3'))
    const headingData = elements.map((element) => ({
      id: element.id,
      text: element.textContent || '',
      level: Number(element.tagName.charAt(1)),
    }))
    setHeadings(headingData)

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '0% 0% -80% 0%' },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  return (
    <nav className="space-y-1">
      {headings.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          className={`block text-sm hover:text-accent-foreground transition-colors ${
            heading.level === 3 ? 'pl-4' : ''
          } ${activeId === heading.id ? 'text-accent-foreground' : 'text-muted-foreground'}`}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  )
}
