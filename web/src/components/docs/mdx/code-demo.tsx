'use client'

import { Check, Copy } from 'lucide-react'
import { Highlight, themes } from 'prism-react-renderer'
import { useMemo, useState } from 'react'

import { Separator } from '@/components/ui/separator'

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

const trimLeadingWhitespace = (content: string): string => {
  const lines = content.split('\n')
  const nonEmptyLines = lines.filter((line) => line.trim() !== '')

  if (nonEmptyLines.length === 0) return content

  // Find the minimum indentation among non-empty lines
  const minIndent = Math.min(
    ...nonEmptyLines.map((line) => {
      const match = line.match(/^\s*/)
      return match ? match[0].length : 0
    }),
  )

  // Remove the minimum indentation from all lines
  const trimmedLines = lines.map((line) => {
    if (line.trim() === '') return line // Keep empty lines as-is
    return line.slice(minIndent)
  })

  return trimmedLines.join('\n')
}

// Map common language aliases to Prism language identifiers
const languageMap: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  md: 'markdown',
  json: 'json',
  html: 'html',
  css: 'css',
  sql: 'sql',
  go: 'go',
  rust: 'rust',
  java: 'java',
  php: 'php',
  ruby: 'ruby',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'csharp',
  'c#': 'csharp',
  swift: 'swift',
  kotlin: 'kotlin',
  scala: 'scala',
  dart: 'dart',
  dockerfile: 'docker',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  xml: 'xml',
  graphql: 'graphql',
  prisma: 'prisma',
}

// Language-specific color constants
const LANGUAGE_COLORS = {
  bash: '#8FE457', // BetweenGreen for bash commands
  white: '#ffffff', // White for text/plain/markdown
  default: null, // Use theme default for other languages
} as const

// Define which languages should use which color scheme
const LANGUAGE_COLOR_MAP: Record<string, keyof typeof LANGUAGE_COLORS> = {
  bash: 'bash',
  text: 'white',
  plain: 'white',
  markdown: 'white',
}

const getLanguageTheme = (language: string) => {
  const baseTheme = themes.vsDark
  const colorScheme = LANGUAGE_COLOR_MAP[language]
  const overrideColor = colorScheme && LANGUAGE_COLORS[colorScheme]

  // For white-only languages, use minimal theme with no token styles
  if (colorScheme === 'white') {
    return {
      theme: {
        plain: { color: '#ffffff', backgroundColor: 'transparent' },
        styles: [],
      },
      tokenColor: '#ffffff',
    }
  }

  return {
    theme: {
      ...baseTheme,
      plain: { ...baseTheme.plain, backgroundColor: 'transparent' },
    },
    tokenColor: overrideColor || null,
  }
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
    return trimLeadingWhitespace(content)
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

  // Normalize language and get theme/color in one useMemo
  const {
    normalizedLanguage,
    theme: highlightTheme,
    tokenColor,
  } = useMemo(() => {
    const normalized = language.toLowerCase().trim()
    const normalizedLang = languageMap[normalized] || normalized
    const { theme, tokenColor } = getLanguageTheme(normalizedLang)
    return {
      normalizedLanguage: normalizedLang,
      theme,
      tokenColor,
    }
  }, [language])

  return (
    <div className="rounded-lg border px-4 w-full max-w-80 md:max-w-full my-3 transition-all group overflow-x-auto">
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
      <div>
        <Highlight
          theme={highlightTheme}
          code={childrenContent}
          language={normalizedLanguage}
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => {
            return (
              <pre
                className={`${className} text-[13px] leading-relaxed py-2 bg-transparent rounded-lg scrollbar-thin scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent`}
                style={{
                  ...style,
                  backgroundColor: 'transparent',
                  color: tokenColor || style.color,
                }}
              >
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    {line.map((token, key) => {
                      const tokenProps = getTokenProps({ token, key })
                      // Override colors for special languages in render loop
                      const color = tokenColor || tokenProps.style?.color

                      return (
                        <span
                          key={key}
                          {...tokenProps}
                          style={{
                            ...tokenProps.style,
                            color,
                          }}
                        />
                      )
                    })}
                  </div>
                ))}
              </pre>
            )
          }}
        </Highlight>
      </div>
    </div>
  )
}
