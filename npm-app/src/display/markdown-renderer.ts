import { highlight } from 'cli-highlight'
import MarkdownIt from 'markdown-it'
// @ts-ignore: Type definitions not available for markdown-it-terminal
import terminal from 'markdown-it-terminal'
import wrapAnsi from 'wrap-ansi'

import { Spinner } from '../utils/spinner'

export type MarkdownStreamRendererOptions = {
  width?: number
  isTTY?: boolean
  syntaxHighlight?: boolean
  theme?: 'light' | 'dark'
  maxBufferKB?: number
  streamingMode?: 'smart' | 'conservative'
}

type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'code-fence'
  | 'table'
  | 'blockquote'
  | 'unknown'

interface BlockState {
  type: BlockType
  buffer: string
  startTime: number
  metadata?: {
    fenceMarker?: '```' | '~~~'
    fenceLang?: string
    listIndent?: number
    tableHeaderSeen?: boolean
  }
}

export class MarkdownStreamRenderer {
  private width: number
  private isTTY: boolean
  private syntaxHighlight: boolean
  private streamingMode: 'smart' | 'conservative'
  private md: MarkdownIt

  // Smart buffering state
  private currentBlock: BlockState | null = null
  private lookaheadBuffer = ''
  private consumedIndex = 0
  private sourceBuffer = ''

  // Loading indicator state
  private resizeHandler?: () => void

  constructor(opts: MarkdownStreamRendererOptions = {}) {
    this.width = opts.width ?? (process.stdout.columns || 80)
    this.isTTY = opts.isTTY ?? process.stdout.isTTY
    this.syntaxHighlight = opts.syntaxHighlight ?? true
    this.streamingMode = opts.streamingMode ?? 'smart'

    // Initialize markdown-it with terminal renderer
    this.md = new MarkdownIt({
      html: false,
      breaks: true, // Enable breaks to preserve newlines in code-like content
      linkify: false,
      typographer: false,
      highlight: this.syntaxHighlight
        ? (code: string, lang: string) => {
            try {
              return highlight(code, {
                language: lang || undefined,
                ignoreIllegals: true,
              })
            } catch {
              return code
            }
          }
        : undefined,
    })

    // Use the terminal renderer plugin with custom styles for better spacing
    this.md.use(terminal, {
      style: {
        // Add spacing after headings
        heading: (text: string) => `\n${text || ''}\n`,
        // Add spacing around paragraphs
        paragraph: (text: string) => `${text || ''}\n`,
        // Customize list items with Unicode bullet points for unordered lists
        listitem: (text: string) => `  • ${text || ''}`,
        // Customize ordered list items to include periods after numbers
        orderedlistitem: (text: string, num: number) =>
          `  ${num || ''}. ${text || ''}`,
        // Code blocks should preserve formatting with minimal spacing
        code_block: (text: string) => `${text || ''}`,
        fence: (text: string, lang?: string) => `${text || ''}`,
        // Disable bold color styling - use same color as default text
        strong: (text: string) => text || '',
      },
    })

    if (process.stdout && 'on' in process.stdout) {
      this.resizeHandler = () => {
        this.width = process.stdout.columns || this.width
      }
      // Use .once with bound handler tracker to avoid duplication
      process.stdout.addListener('resize', this.resizeHandler)
    }
  }

  write(chunk: string): string[] {
    const outs: string[] = []

    // Append to source buffer (never drop content)
    this.sourceBuffer += chunk

    // Smart mode: analyze content and decide when to flush
    if (this.streamingMode === 'smart') {
      this.processSmartMode(chunk, outs)
    } else {
      // Conservative mode: original behavior
      this.processConservativeMode(chunk, outs)
    }

    return outs
  }

  private processSmartMode(text: string, outs: string[]) {
    // Add to lookahead buffer
    this.lookaheadBuffer += text

    // Process line by line with lookahead
    const lines = this.lookaheadBuffer.split('\n')

    // Keep last line as lookahead (unless it's empty at the end)
    const linesToProcess = lines.slice(0, -1)
    const remainingLookahead = lines[lines.length - 1]

    for (let i = 0; i < linesToProcess.length; i++) {
      const line = linesToProcess[i]
      const nextLine =
        i < linesToProcess.length - 1
          ? linesToProcess[i + 1]
          : remainingLookahead

      this.processLine(line, nextLine, outs)
    }

    // Update lookahead
    this.lookaheadBuffer = remainingLookahead

    // Check if we should force flush due to age or size
    this.checkForceFlush(outs)

    Spinner.get().start(null, true)
  }

  private processLine(
    line: string,
    nextLine: string | undefined,
    outs: string[],
  ) {
    // Detect block type if we don't have one
    if (!this.currentBlock) {
      const blockType = this.detectBlockType(line, nextLine)
      if (blockType !== 'unknown') {
        this.currentBlock = {
          type: blockType,
          buffer: '',
          startTime: Date.now(),
          metadata: this.getBlockMetadata(blockType, line),
        }
      }
    }

    if (!this.currentBlock) {
      // Plain text, render and flush immediately
      const content = line + '\n'
      const rendered = this.render(content)
      outs.push(rendered)
      this.consumedIndex += content.length
      return
    }

    // Add line to current block
    this.currentBlock.buffer += line + '\n'

    // Check if block is complete
    if (this.isBlockComplete(this.currentBlock, line, nextLine)) {
      this.flushBlock(outs)
    }
  }

  private detectBlockType(
    line: string,
    nextLine: string | undefined,
  ): BlockType {
    const trimmed = line.trim()

    // Code fence
    if (trimmed.match(/^(```|~~~)/)) {
      return 'code-fence'
    }

    // Indented code block (4+ spaces)
    if (line.match(/^    /) && trimmed.length > 0) {
      return 'code-fence' // Treat as code-fence for consistent handling
    }

    // Heading
    if (trimmed.match(/^#+\s/)) {
      return 'heading'
    }

    // List
    if (trimmed.match(/^\s*([-*+]|\d+\.)\s/)) {
      return 'list'
    }

    // Table (needs header + separator)
    if (trimmed.includes('|') && nextLine?.trim().match(/^\|?\s*[-:]+\s*\|/)) {
      return 'table'
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      return 'blockquote'
    }

    // Paragraph
    if (trimmed.length > 0) {
      return 'paragraph'
    }

    return 'unknown'
  }

  private getBlockMetadata(
    type: BlockType,
    line: string,
  ): BlockState['metadata'] {
    if (type === 'code-fence') {
      const match = line.trim().match(/(```|~~~)\s*([a-zA-Z0-9_+\-]*)?/)
      if (match) {
        return {
          fenceMarker: match[1] as '```' | '~~~',
          fenceLang: match[2] || undefined,
        }
      }
    }

    if (type === 'list') {
      const match = line.match(/^(\s*)([-*+]|\d+\.)\s/)
      if (match) {
        return { listIndent: match[1].length }
      }
    }

    return {}
  }

  private isBlockComplete(
    block: BlockState,
    currentLine: string,
    nextLine: string | undefined,
  ): boolean {
    const trimmedNext = nextLine?.trim() || ''

    switch (block.type) {
      case 'heading':
        // Headings are complete after the line
        return true

      case 'paragraph':
        // Complete on blank line or start of new block
        return (
          trimmedNext === '' ||
          this.detectBlockType(nextLine || '', undefined) !== 'unknown'
        )

      case 'code-fence':
        // Handle fenced code blocks
        if (block.metadata?.fenceMarker) {
          return currentLine.trim() === block.metadata.fenceMarker
        }
        // Handle indented code blocks - complete when next line isn't indented
        if (!block.metadata?.fenceMarker) {
          return !nextLine?.match(/^    /) && trimmedNext !== ''
        }
        return false

      case 'list':
        // For lists, be smarter about when to complete
        if (trimmedNext === '') {
          // Don't complete on blank line if there might be more list items
          // Check remaining lookahead for potential list items
          const remainingLines = this.lookaheadBuffer.split('\n').slice(1)
          const hasMoreListItems = remainingLines.some((line) =>
            line.trim().match(/^(\s*)([-*+]|\d+\.)\s/),
          )
          return !hasMoreListItems
        }
        const nextListMatch = nextLine?.match(/^(\s*)([-*+]|\d+\.)\s/)
        if (!nextListMatch) return true
        // Check for different indent level
        return nextListMatch[1].length !== block.metadata?.listIndent

      case 'table':
        // Complete on non-table line
        return !trimmedNext.includes('|')

      case 'blockquote':
        // Complete on non-quote line
        return !trimmedNext.startsWith('>')

      default:
        return true
    }
  }

  private flushBlock(outs: string[]) {
    if (!this.currentBlock) return

    // Hide loading indicator if showing
    Spinner.get().stop()

    // Render the block
    const rendered = this.render(this.currentBlock.buffer)
    outs.push(rendered)

    // Update consumed index
    this.consumedIndex =
      this.sourceBuffer.indexOf(this.currentBlock.buffer, this.consumedIndex) +
      this.currentBlock.buffer.length

    // Reset block state
    this.currentBlock = null
  }

  private checkForceFlush(outs: string[]) {
    if (!this.currentBlock) return
    if (this.currentBlock.type === 'code-fence') return

    const now = Date.now()
    const age = now - this.currentBlock.startTime
    const size = this.currentBlock.buffer.length

    // Force flush conditions
    const shouldForceFlush =
      age > 500 || // 500ms max wait
      size > 4096 || // 4KB max buffer
      (age > 250 && this.currentBlock.type === 'paragraph') || // Paragraphs flush faster
      (age > 1000 && this.currentBlock.type === 'list') // Lists get extra time to accumulate

    if (shouldForceFlush) {
      // Hide indicator since we flushed something
      Spinner.get().stop()

      // Try to find a soft boundary for force flush
      const buffer = this.currentBlock.buffer
      const sentenceEnd = buffer.lastIndexOf('. ')
      const lineEnd = buffer.lastIndexOf('\n')

      let flushPoint = Math.max(sentenceEnd, lineEnd)
      if (flushPoint > 0 && flushPoint < buffer.length - 1) {
        // Flush up to soft boundary
        const toFlush = buffer.substring(0, flushPoint + 1)
        this.currentBlock.buffer = buffer.substring(flushPoint + 1)

        const rendered = this.render(toFlush)
        outs.push(rendered)
        this.consumedIndex += toFlush.length
      }
    }
  }

  private processConservativeMode(text: string, outs: string[]) {
    // This is a simplified version of the original behavior
    // Just accumulate and flush on double newlines
    const accumulated = this.lookaheadBuffer + text
    const parts = accumulated.split('\n\n')

    // Flush all complete parts
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] + '\n\n'
      const rendered = this.render(part)
      outs.push(rendered)
      this.consumedIndex += part.length
    }

    // Keep last part as lookahead
    this.lookaheadBuffer = parts[parts.length - 1]
  }

  end(): string | null {
    // Hide any loading indicator
    Spinner.get().stop()

    const outputs: string[] = []

    // Flush current block if any
    if (this.currentBlock) {
      outputs.push(this.render(this.currentBlock.buffer))
    }

    // Flush any remaining lookahead
    if (this.lookaheadBuffer) {
      outputs.push(this.render(this.lookaheadBuffer))
    }

    // Reset all state
    this.sourceBuffer = ''
    this.consumedIndex = 0
    this.lookaheadBuffer = ''
    this.currentBlock = null

    // Cleanup event listeners
    this.cleanup()

    return outputs.length ? outputs.join('') : null
  }

  cleanup() {
    if (this.resizeHandler && process.stdout && 'off' in process.stdout) {
      process.stdout.off('resize', this.resizeHandler)
      this.resizeHandler = undefined
    }
  }

  private normalizeListItems(md: string): string {
    // Fix ordered lists that have blank lines between items
    // This ensures markdown-it treats them as a single list with proper numbering
    const lines = md.split('\n')
    const result: string[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]

      // Check if current line starts an ordered list item
      if (line.match(/^\s*\d+\.\s/)) {
        result.push(line)
        i++

        // Look ahead for more list items separated by blank lines
        while (i < lines.length) {
          // Skip blank lines
          while (i < lines.length && lines[i].trim() === '') {
            i++
          }

          // Check if next non-blank line is also a list item
          if (i < lines.length && lines[i].match(/^\s*\d+\.\s/)) {
            result.push(lines[i])
            i++
          } else {
            // Not a list item, add back any blank lines we skipped and the line
            if (i < lines.length) {
              result.push('') // Add one blank line before non-list content
              result.push(lines[i])
              i++
            }
            break
          }
        }
      } else {
        result.push(line)
        i++
      }
    }

    return result.join('\n')
  }

  private render(md: string): string {
    if (!this.isTTY) return md

    // Preprocess markdown to fix separated list items
    md = this.normalizeListItems(md)

    const codeBlockRegex = /(```|~~~)([^\n]*)\n([\s\S]*?)\1/g
    const codeBlocks: string[] = []
    let codeBlockIndex = 0

    const padLeft = '  '
    const padRight = '  '

    const mdWithPlaceholders = md.replace(
      codeBlockRegex,
      (match, fence, lang, code) => {
        const cleanCode = code.replace(/\n$/, '')

        let formattedCode = cleanCode
        if (this.syntaxHighlight && lang) {
          try {
            formattedCode = highlight(cleanCode, {
              language: lang,
              ignoreIllegals: true,
            })
          } catch {}
        }

        const bgGray = '\x1b[48;5;236m'
        const reset = '\x1b[0m'
        const reapplyBg = (s: string) =>
          s.replace(/\x1b\[0m/g, `${reset}${bgGray}`)
        formattedCode = reapplyBg(formattedCode)

        const lines = formattedCode.split('\n')

        // Calculate actual width needed based on longest line
        const maxLineLength = lines.reduce((max: number, line: string) => {
          // Remove ANSI escape codes to get actual visible length
          const visibleLength = line.replace(/\x1b\[[^m]*m/g, '').length
          return Math.max(max, visibleLength)
        }, 0)

        // Use the actual content width, but cap it at terminal width
        const availableWidth = this.width - padLeft.length - padRight.length
        const wrapWidth = Math.max(
          20, // minimum width
          Math.min(maxLineLength, availableWidth, 120), // cap at available terminal width or 120
        )
        const wrappedLines: string[] = []

        for (const line of lines) {
          const leadingWsMatch = line.match(/^\s*/)
          const leadingWs = leadingWsMatch ? leadingWsMatch[0] : ''
          const content = line.slice(leadingWs.length)
          const avail = Math.max(1, wrapWidth - leadingWs.length)
          const wrapped = wrapAnsi(content, avail, { hard: true }).split('\n')
          wrapped.forEach((seg) => {
            const visibleLen =
              leadingWs.length + seg.replace(/\x1b\[[^m]*m/g, '').length
            const padding = Math.max(0, wrapWidth - visibleLen)
            wrappedLines.push(
              `${bgGray}${padLeft}${leadingWs}${seg}${' '.repeat(padding)}${padRight}${reset}`,
            )
          })
        }

        const bufferLine = `${bgGray}\`\`\`${padLeft}${' '.repeat(wrapWidth - 3)}${padRight}${reset}`
        const backgroundCode = [
          bufferLine,
          ...wrappedLines,
          bufferLine,
          '',
        ].join('\n')

        codeBlocks.push(backgroundCode)
        return `CODE_BLOCK_PLACEHOLDER_${codeBlockIndex++}`
      },
    )

    let rendered = this.md.render(mdWithPlaceholders)

    rendered = rendered.replace(
      // Match optional newlines before and after the placeholder
      /\n*CODE_BLOCK_PLACEHOLDER_(\d+)\n*/g,
      (match, idx) => {
        // Use the captured index from the placeholder for robustness
        const block = codeBlocks[+idx] || ''
        if (!block) return ''

        // Ensure exactly one newline before and after the block
        return `\n${block.trimEnd()}\n`
      },
    )

    rendered = rendered.replace(/^   \x1b\[0m\* /gm, '   \x1b[0m• ')
    rendered = rendered.replace(/^   \x1b\[0m(\d+) /gm, '   \x1b[0m$1. ')

    // Preserve spacing around agent completion messages (lines with dashes)
    // First, protect agent completion messages from normalization
    const protectedLines: string[] = []
    let protectionIndex = 0

    // Find and protect lines that look like agent messages (start and end with dashes)
    rendered = rendered.replace(
      /\n*([-]{2,}[^\n]*[-]{2,})\n*/g,
      (match, agentMessage) => {
        const placeholder = `__PROTECTED_AGENT_MESSAGE_${protectionIndex++}__`
        // Store the agent message with exactly 2 newlines above and below
        protectedLines.push(`\n\n${agentMessage}\n\n`)
        return placeholder
      },
    )

    // Apply normal normalization
    rendered = rendered.replace(/\n{3,}/g, '\n\n')
    rendered = rendered.replace(/^\n+/, '')
    rendered = rendered.replace(/\n+$/, '\n')

    // Restore protected agent messages
    protectionIndex = 0
    rendered = rendered.replace(
      /__PROTECTED_AGENT_MESSAGE_(\d+)__/g,
      (_, idx) => protectedLines[+idx] ?? '',
    )

    return rendered
  }
}
