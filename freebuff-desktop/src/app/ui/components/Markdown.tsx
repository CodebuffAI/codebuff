import { memo, useState, type ReactNode } from 'react'

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { copyText } from '../lib/clipboard'

/**
 * Renders assistant output as GitHub-flavored markdown. Custom renderers give us
 * a code block with a copy button, line-coloured `diff` fences, and tables that
 * match the app chrome. Memoized so a streaming sibling message doesn't re-parse
 * already-settled transcript entries.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  )
})

const COMPONENTS: Components = {
  // Block code is wrapped by react-markdown in <pre><code>. We render our own
  // chrome from the <code> node and collapse <pre> to a fragment so it doesn't
  // double-wrap. Inline code (no language class, single line) stays a plain tag.
  pre: ({ children }) => <>{children}</>,
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? '')
    const raw = String(children ?? '')
    if (!match && !raw.includes('\n')) {
      return (
        <code className="md-inline" {...props}>
          {children}
        </code>
      )
    }
    return <CodeBlock lang={match?.[1]} code={raw.replace(/\n$/, '')} />
  },
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="md-table-wrap">
      <table>{children}</table>
    </div>
  ),
}

function CodeBlock({ lang, code }: { lang?: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void copyText(code).then((ok) => {
      if (!ok) return
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }
  const isDiff = lang === 'diff'
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span className="md-code-lang">{lang || 'text'}</span>
        <button className="md-copy" onClick={copy} title="Copy code">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={`md-pre${isDiff ? ' diff' : ''}`}>
        <code>{isDiff ? renderDiff(code) : code}</code>
      </pre>
    </div>
  )
}

/** Colour each line of a `diff` fence by its leading marker. */
function renderDiff(code: string): ReactNode[] {
  return code.split('\n').map((line, i) => {
    let cls = ''
    if (/^\+\+\+|^---|^diff |^index /.test(line)) cls = 'd-meta'
    else if (line.startsWith('@@')) cls = 'd-hunk'
    else if (line.startsWith('+')) cls = 'd-add'
    else if (line.startsWith('-')) cls = 'd-del'
    return (
      <span key={i} className={`d-line ${cls}`}>
        {line || ' '}
        {'\n'}
      </span>
    )
  })
}
