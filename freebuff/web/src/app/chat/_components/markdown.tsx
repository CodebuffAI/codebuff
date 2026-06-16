'use client'

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

function isTrackedSetupLink(href: unknown): href is string {
  return (
    typeof href === 'string' &&
    /^https:\/\/index\.trygravity\.ai\/go\//.test(href)
  )
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, className, children, href, ...props }) => {
            const trackedSetupLink = isTrackedSetupLink(href)
            return (
              <a
                {...props}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  trackedSetupLink &&
                    'my-1 inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground no-underline shadow-sm transition-colors hover:bg-primary/90',
                  className,
                )}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
