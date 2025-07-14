'use client'

import { Separator } from '@/components/ui/separator'
import { Check, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MermaidDiagram } from './mermaid-diagram'

type CodeDemoChildren = string | JSX.Element | JSX.Element[]

interface CodeDemoProps {
  children: CodeDemoChildren
  language: string
  rawContent?: string
}

const getContent = (c: CodeDemoChildren): string => {
  if (typeof c === 'string') {
    return c
  }

  if (Array.isArray(c)) {
    const result = c.map((child) => getContent(child)).join('\n')
    return result
  }

  if (typeof c === 'object' && c.props && c.props.children) {
    const result = getContent(c.props.children)
    return result
  }

  return ''
}

export function CodeDemo({ children, language, rawContent }: CodeDemoProps) {
  const [copied, setCopied] = useState(false)

  // Enforce that language is required
  if (!language || language.trim() === '') {
    throw new Error('CodeDemo requires a language to be specified')
  }

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const childrenContent = useMemo(() => {
    // Use rawContent if available (from remark plugin), otherwise fall back to processing children
    const content = rawContent || getContent(children)
    return content
  }, [children, language, rawContent])

  // Check if this is a mermaid diagram
  const isMermaid = language?.toLowerCase() === 'mermaid'

  if (isMermaid) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 w-full max-w-80 md:max-w-full my-3 transition-all group hover:bg-muted/40 overflow-hidden">
        <div className="flex items-center justify-between h-6 mt-0.5 mb-0.5">
          <div className="text-[10px] text-muted-foreground/40 font-mono tracking-wide">
            mermaid diagram
          </div>
          <button
            onClick={() => copyToClipboard(childrenContent)}
            className="p-1 hover:bg-muted rounded-md transition-all md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none"
            aria-label={copied ? 'Copied!' : 'Copy diagram code'}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-foreground md:text-muted-foreground" />
            )}
          </button>
        </div>
        <Separator className="bg-border/20 mb-0.5" />
        <div className="py-4">
          <MermaidDiagram code={childrenContent} />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-muted/30 px-4 w-full max-w-80 md:max-w-full my-3 transition-all group hover:bg-muted/40 overflow-hidden">
      <div className="flex items-center justify-between h-6 mt-0.5 mb-0.5">
        <div className="text-[10px] text-muted-foreground/40 font-mono tracking-wide">
          {language.toLowerCase()}
        </div>
        <button
          onClick={() => copyToClipboard(childrenContent)}
          className="p-1 hover:bg-muted rounded-md transition-all md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none"
          aria-label={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-foreground md:text-muted-foreground" />
          )}
        </button>
      </div>
      {language && <Separator className="bg-border/20 mb-0.5" />}
      <pre className="text-[13px] leading-relaxed py-1 bg-transparent text-foreground/90 rounded-lg overflow-x-auto scrollbar-thin scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent">
        <code className="font-mono">{childrenContent}</code>
      </pre>
    </div>
  )
}
