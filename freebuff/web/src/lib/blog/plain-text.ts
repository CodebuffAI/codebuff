import type { Block, Post } from './types'

/**
 * Render post blocks to markdown-flavored plain text.
 *
 * Used by /llms-full.txt so AI crawlers and answer engines can read full
 * article content without parsing our HTML. Mirrors the structure of
 * post-body.tsx but emits text only.
 */
export function blocksToText(blocks: Block[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'p':
      case 'lede':
        parts.push(block.text)
        break
      case 'h2':
        parts.push(`## ${block.text}`)
        break
      case 'h3':
        parts.push(`### ${block.text}`)
        break
      case 'ul':
        parts.push(block.items.map((item) => `- ${item}`).join('\n'))
        break
      case 'ol':
        parts.push(block.items.map((item, i) => `${i + 1}. ${item}`).join('\n'))
        break
      case 'quote':
        parts.push(
          `> ${block.text}` +
            (block.attribution ? `\n> — ${block.attribution}` : ''),
        )
        break
      case 'callout':
        parts.push((block.title ? `**${block.title}**: ` : '') + block.text)
        break
      case 'code':
        parts.push(
          '```' +
            (block.lang ?? '') +
            '\n' +
            block.code +
            '\n```' +
            (block.caption ? `\n${block.caption}` : ''),
        )
        break
      case 'cta':
        parts.push(
          `${block.title}${block.description ? ` — ${block.description}` : ''} (${block.label}: ${block.href})`,
        )
        break
      case 'compare':
        parts.push(
          [
            `| Feature | Freebuff | ${block.competitor} |`,
            '| --- | --- | --- |',
            ...block.rows.map(
              (r) => `| ${r.feature} | ${r.freebuff} | ${r.competitor} |`,
            ),
          ].join('\n'),
        )
        break
      case 'faq':
        parts.push(
          block.items
            .map((item) => `**Q: ${item.q}**\n\nA: ${item.a}`)
            .join('\n\n'),
        )
        break
      case 'tldr':
        parts.push(
          'TL;DR:\n' + block.items.map((item) => `- ${item}`).join('\n'),
        )
        break
      case 'hr':
        parts.push('---')
        break
      default:
        // Compile error here means a new Block type needs a text rendering.
        block satisfies never
    }
  }
  return parts.join('\n\n')
}

/** Render a full post (title, dates, body) to markdown for llms-full.txt. */
export function postToText(post: Post): string {
  const header = [
    `# ${post.title}`,
    post.subtitle ?? '',
    `Published: ${post.publishedAt}${post.updatedAt ? ` (updated ${post.updatedAt})` : ''}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return `${header}\n\n${blocksToText(post.body)}`
}
