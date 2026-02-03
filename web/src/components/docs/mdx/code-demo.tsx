'use client'

import { Check, Copy } from 'lucide-react'
import { Highlight, themes } from 'prism-react-renderer'
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
  }, [children, rawContent])

  // Check if this is a mermaid diagram
  const isMermaid = language?.toLowerCase() === 'mermaid'

  // Normalize language and get theme/color - must be called unconditionally
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

  if (isMermaid) {
    return (
      <div className="bg-zinc-800/60 rounded-md w-full my-3 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="text-xs text-white/40 font-mono">
            mermaid diagram
          </div>
          <button
            onClick={() => copyToClipboard(childrenContent)}
            className="p-2 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-colors duration-200"
            aria-label={copied ? 'Copied!' : 'Copy diagram code'}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="px-3 pb-4">
          <MermaidDiagram code={childrenContent} />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-zinc-800/60 rounded-md px-3 py-2.5 w-full my-3 flex items-center justify-between overflow-x-auto">
      <div className="flex-1 min-w-0">
        <Highlight
          theme={highlightTheme}
          code={childrenContent}
          language={normalizedLanguage}
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => {
            return (
              <pre
                className={`${className} text-sm leading-relaxed bg-transparent scrollbar-thin scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent`}
                style={{
                  ...style,
                  backgroundColor: 'transparent',
                  color: tokenColor || style.color,
                  margin: 0,
                }}
              >
                {tokens.map((line, i) => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { key: _lineKey, ...lineProps } = getLineProps({ line })
                  return (
                    <div key={i} {...lineProps}>
                      {line.map((token, tokenIndex) => {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { key: _tokenKey, ...tokenProps } = getTokenProps(
                          { token, key: tokenIndex },
                        )
                        // Override colors for special languages in render loop
                        const color = tokenColor || tokenProps.style?.color

                        return (
                          <span
                            key={tokenIndex}
                            {...tokenProps}
                            style={{
                              ...tokenProps.style,
                              color,
                            }}
                          />
                        )
                      })}
                    </div>
                  )
                })}
              </pre>
            )
          }}
        </Highlight>
      </div>
      <button
        onClick={() => copyToClipboard(childrenContent)}
        className="flex-shrink-0 p-2 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-colors duration-200 ml-2"
        aria-label={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
