'use client'

import { isValidElement, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { ReactNode } from 'react'

import { CopyButton } from '@/components/copy-button'
import { cn } from '@/lib/utils'

function isTrackedSetupLink(href: unknown): href is string {
  return (
    typeof href === 'string' &&
    /^https:\/\/index\.trygravity\.ai\/go\//.test(href)
  )
}

// Pull the raw text out of a rendered node tree so the copy button can grab the
// code block's contents (react-markdown v10 gives `pre` the `<code>` element,
// not the source string).
function nodeText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isValidElement(node)) {
    return nodeText((node.props as { children?: ReactNode }).children)
  }
  return ''
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ node, children, ...props }) => (
            <div className="group/code relative">
              <CopyButton
                value={nodeText(children)}
                className="absolute right-2 top-2 border border-white/10 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover/code:opacity-100 focus:opacity-100"
              />
              <pre {...props}>{children}</pre>
            </div>
          ),
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
                    'chat-setup-link my-1 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition-colors',
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
