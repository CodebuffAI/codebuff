import { Fragment, type ReactNode } from 'react'

/**
 * Minimal inline markdown renderer.
 *
 * Supports `**bold**`, `*italic*`, backtick `code`, and `[label](href)` links.
 * No external dep — we control the surface area, so we keep it tiny.
 */
export function InlineMd({ text }: { text: string }): ReactNode {
  return <>{render(text)}</>
}

function render(text: string): ReactNode[] {
  const tokens: ReactNode[] = []
  let rest = text
  let key = 0

  // Links first so they don't get clobbered by other patterns.
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/
  while (rest.length > 0) {
    const link = rest.match(linkRegex)
    if (!link) break
    const before = rest.slice(0, link.index)
    if (before) tokens.push(...renderEmphasis(before, key++))
    const isExternal = /^https?:/.test(link[2])
    tokens.push(
      <a
        key={`a-${key++}`}
        href={link[2]}
        className="text-acid-matrix underline decoration-acid-matrix/40 underline-offset-4 hover:decoration-acid-matrix"
        {...(isExternal
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {})}
      >
        {link[1]}
      </a>,
    )
    rest = rest.slice((link.index ?? 0) + link[0].length)
  }
  if (rest) tokens.push(...renderEmphasis(rest, key++))
  return tokens
}

function renderEmphasis(text: string, baseKey: number): ReactNode[] {
  const out: ReactNode[] = []
  // Order matters: process **bold** before *italic*; backticks are last.
  const patterns: Array<{ re: RegExp; wrap: (inner: string, k: string) => ReactNode }> = [
    {
      re: /\*\*(.+?)\*\*/g,
      wrap: (inner, k) => (
        <strong key={k} className="font-semibold text-white">
          {inner}
        </strong>
      ),
    },
    {
      re: /\*(.+?)\*/g,
      wrap: (inner, k) => (
        <em key={k} className="italic">
          {inner}
        </em>
      ),
    },
    {
      re: /`([^`]+)`/g,
      wrap: (inner, k) => (
        <code
          key={k}
          className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.86em] text-zinc-100 ring-1 ring-inset ring-white/10"
        >
          {inner}
        </code>
      ),
    },
  ]

  // We do a single pass left-to-right: find the earliest match across all patterns.
  let cursor = 0
  let counter = 0
  while (cursor < text.length) {
    let earliest: { start: number; end: number; node: ReactNode } | null = null
    for (const pat of patterns) {
      pat.re.lastIndex = cursor
      const m = pat.re.exec(text)
      if (m && (earliest === null || m.index < earliest.start)) {
        earliest = {
          start: m.index,
          end: m.index + m[0].length,
          node: pat.wrap(m[1], `e-${baseKey}-${counter++}`),
        }
      }
    }
    if (!earliest) {
      out.push(<Fragment key={`t-${baseKey}-${counter++}`}>{text.slice(cursor)}</Fragment>)
      break
    }
    if (earliest.start > cursor) {
      out.push(
        <Fragment key={`t-${baseKey}-${counter++}`}>
          {text.slice(cursor, earliest.start)}
        </Fragment>,
      )
    }
    out.push(earliest.node)
    cursor = earliest.end
  }
  return out
}
