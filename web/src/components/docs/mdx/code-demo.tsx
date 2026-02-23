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

  const minIndent = Math.min(
    ...nonEmptyLines.map((line) => {
      const match = line.match(/^\s*/)
      return match ? match[0].length : 0
    }),
  )

  const trimmedLines = lines.map((line) => {
    if (line.trim() === '') return line
    return line.slice(minIndent)
  })

  return trimmedLines.join('\n')
}

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

// Accent dot color per language
const LANGUAGE_DOT_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  tsx: '#3178c6',
  javascript: '#f7df1e',
  jsx: '#61dafb',
  python: '#3572a5',
  bash: '#89e051',
  json: '#f97316',
  yaml: '#fbbf24',
  css: '#a855f7',
  html: '#e34c26',
  rust: '#dea584',
  go: '#00add8',
  markdown: '#94a3b8',
  text: '#6b7280',
  sql: '#e88c00',
  graphql: '#e10098',
  docker: '#0db7ed',
}

const LANGUAGE_COLORS = {
  bash: '#8FE457',
  white: '#ffffff',
  default: null,
} as const

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

  if (!language || language.trim() === '') {
    throw new Error('CodeDemo requires a language to be specified')
  }

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const childrenContent = useMemo(() => {
    const content = rawContent || getContent(children)
    return trimLeadingWhitespace(content)
  }, [children, rawContent])

  const isMermaid = language?.toLowerCase() === 'mermaid'

  const {
    normalizedLanguage,
    theme: highlightTheme,
    tokenColor,
  } = useMemo(() => {
    const normalized = language.toLowerCase().trim()
    const normalizedLang = languageMap[normalized] || normalized
    const { theme, tokenColor } = getLanguageTheme(normalizedLang)
    return { normalizedLanguage: normalizedLang, theme, tokenColor }
  }, [language])

  const isMultiLine = useMemo(() => {
    const nonEmpty = childrenContent.split('\n').filter((l) => l.trim() !== '')
    return nonEmpty.length > 1
  }, [childrenContent])

  const dotColor = LANGUAGE_DOT_COLORS[normalizedLanguage] ?? '#6b7280'
  const displayLang = language.toLowerCase().trim()

  const CopyButton = ({ small }: { small?: boolean }) => (
    <button
      onClick={() => copyToClipboard(childrenContent)}
      className={`flex items-center gap-1.5 font-mono transition-colors duration-150 rounded hover:bg-white/5 ${
        small
          ? 'text-xs text-white/40 hover:text-white/70 px-2 py-1'
          : 'text-xs text-white/40 hover:text-white/70 px-2 py-1'
      }`}
      aria-label={copied ? 'Copied!' : 'Copy code'}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
          <span className="text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Copy</span>
        </>
      )}
    </button>
  )

  if (isMermaid) {
    return (
      <div className="rounded-xl overflow-hidden border border-white/10 my-4 bg-[#0d1117]">
        <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
            <span className="text-xs text-white/50 font-mono">mermaid</span>
          </div>
          <CopyButton />
        </div>
        <div className="px-4 py-4">
          <MermaidDiagram code={childrenContent} />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-white/10 my-4 bg-[#0d1117]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-xs text-white/50 font-mono">{displayLang}</span>
        </div>
        <CopyButton />
      </div>

      {/* Code area */}
      <div className="overflow-x-auto">
        <Highlight
          theme={highlightTheme}
          code={childrenContent}
          language={normalizedLanguage}
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={`${className} text-sm leading-6`}
              style={{
                ...style,
                backgroundColor: 'transparent',
                color: tokenColor || style.color,
                margin: 0,
                padding: isMultiLine ? '1rem 1.25rem' : '0.75rem 1.25rem',
              }}
            >
              {tokens.map((line, i) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { key: _lineKey, ...lineProps } = getLineProps({ line })
                return (
                  <div key={i} {...lineProps} className="flex">
                    {isMultiLine && (
                      <span
                        className="select-none text-right mr-5 text-white/20 flex-shrink-0 tabular-nums"
                        style={{ minWidth: '1.25rem' }}
                      >
                        {i + 1}
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      {line.map((token, tokenIndex) => {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { key: _tokenKey, ...tokenProps } = getTokenProps({
                          token,
                          key: tokenIndex,
                        })
                        const color = tokenColor || tokenProps.style?.color
                        return (
                          <span
                            key={tokenIndex}
                            {...tokenProps}
                            style={{ ...tokenProps.style, color }}
                          />
                        )
                      })}
                    </span>
                  </div>
                )
              })}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  )
}
