import MarkdownIt from 'markdown-it'
import terminal from 'markdown-it-terminal'
import { highlight } from 'cli-highlight'

export type MarkdownStreamRendererOptions = {
  width?: number
  isTTY?: boolean
  syntaxHighlight?: boolean
  theme?: 'light' | 'dark'
  maxBufferKB?: number
}

export class MarkdownStreamRenderer {
  private width: number
  private isTTY: boolean
  private syntaxHighlight: boolean
  private maxBufferBytes: number
  private normalBuffer = ''
  private codeFenceBuffer = ''
  private inFence = false
  private fenceMarker: '```' | '~~~' | null = null
  private fenceLang: string | null = null
  private inList = false
  private listIndentLevel = 0
  private md: MarkdownIt

  constructor(opts: MarkdownStreamRendererOptions = {}) {
    this.width = opts.width ?? (process.stdout.columns || 80)
    this.isTTY = opts.isTTY ?? process.stdout.isTTY
    this.syntaxHighlight = opts.syntaxHighlight ?? true
    this.maxBufferBytes = (opts.maxBufferKB ?? 64) * 1024

    // Initialize markdown-it with terminal renderer
    this.md = new MarkdownIt({
      html: false,
      breaks: false,
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
        heading: (text: string) => `\n${text}\n`,
        // Add spacing around paragraphs
        paragraph: (text: string) => `${text}\n`,
        // Customize list items with Unicode bullet points for unordered lists
        listitem: (text: string) => `  • ${text}`,
        // Customize ordered list items to include periods after numbers
        orderedlistitem: (text: string, num: number) => `  ${num}. ${text}`,
      },
    })

    if (process.stdout && 'on' in process.stdout) {
      process.stdout.on('resize', () => {
        this.width = process.stdout.columns || this.width
      })
    }
  }

  write(chunk: string): string[] {
    const outs: string[] = []
    const lines = chunk.split(/(\n)/)

    for (const line of lines) {
      if (!line) continue
      if (this.inFence) {
        this.codeFenceBuffer += line
        if (line.trim().startsWith(this.fenceMarker!)) {
          const rendered = this.renderFence()
          outs.push(rendered)
          this.codeFenceBuffer = ''
          this.inFence = false
          this.fenceMarker = null
          this.fenceLang = null
        }
        continue
      }
      if (line.trim().match(/^(```|~~~)/)) {
        const m = line.trim().match(/(```|~~~)\s*([a-zA-Z0-9_+\-]*)?/)
        if (m) {
          this.flushNormal(outs)
          this.inFence = true
          this.fenceMarker = m[1] as '```' | '~~~'
          this.fenceLang = m[2] || null
          this.codeFenceBuffer = line + '\n'
          continue
        }
      }

      // Track if we're in a list
      const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s/)
      if (listMatch) {
        this.inList = true
        this.listIndentLevel = listMatch[1].length
      }

      // Simply concatenate without adding spaces
      // The original text should already have proper spacing
      this.normalBuffer += line

      // Special handling for headings - always flush after a complete heading line
      if (line === '\n' && this.normalBuffer.length > 0) {
        const lines = this.normalBuffer.split('\n')
        const previousLine = lines[lines.length - 2] || ''
        if (this.isHeading(previousLine)) {
          // We have a complete heading followed by a newline, flush it
          this.flushNormal(outs)
          this.inList = false
          this.listIndentLevel = 0
          continue
        }
      }

      // Check if we should flush
      const shouldFlush = this.shouldFlushBuffer()

      if (shouldFlush) {
        this.flushNormal(outs)
        this.inList = false
        this.listIndentLevel = 0
      } else if (this.normalBuffer.length > this.maxBufferBytes) {
        outs.push(this.render(this.normalBuffer))
        this.normalBuffer = ''
        this.inList = false
        this.listIndentLevel = 0
      }
    }

    // For non-markdown plain text streaming
    // If we have a small buffer that doesn't look like it's building markdown,
    // flush it for better streaming experience
    if (
      !this.inFence &&
      this.normalBuffer.length > 0 &&
      this.normalBuffer.length < 50 &&
      !this.hasMarkdownIndicators(this.normalBuffer) &&
      !this.normalBuffer.includes('*') &&
      !this.normalBuffer.includes('_')
    ) {
      // Check if we should flush - flush on word boundaries
      const endsWithSpace = this.normalBuffer.endsWith(' ')
      const endsWithNewline = this.normalBuffer.endsWith('\n')
      const endsWithPunctuation = /[.!?,;:]$/.test(this.normalBuffer)

      if (endsWithSpace || endsWithNewline || endsWithPunctuation) {
        outs.push(this.normalBuffer)
        this.normalBuffer = ''
      } else if (this.normalBuffer.length > 40) {
        // Buffer is getting long, flush up to the last word boundary
        const lastSpaceIndex = this.normalBuffer.lastIndexOf(' ')
        if (lastSpaceIndex !== -1) {
          const partToFlush = this.normalBuffer.substring(0, lastSpaceIndex + 1)
          outs.push(partToFlush)
          this.normalBuffer = this.normalBuffer.substring(lastSpaceIndex + 1)
        }
      }
    }

    return outs
  }

  end(): string | null {
    const outputs: string[] = []
    this.flushNormal(outputs)
    if (this.codeFenceBuffer) {
      outputs.push(this.render(this.codeFenceBuffer))
      this.codeFenceBuffer = ''
    }
    return outputs.length ? outputs.join('') : null
  }

  private flushNormal(outs: string[], addSpacePrefix = false) {
    if (this.normalBuffer.trim().length > 0) {
      const buffer =
        addSpacePrefix && !this.normalBuffer.startsWith(' ')
          ? ' ' + this.normalBuffer
          : this.normalBuffer
      outs.push(this.render(buffer))
      this.normalBuffer = ''
    }
  }

  private renderFence(): string {
    return this.render(this.codeFenceBuffer)
  }

  private hasMarkdownIndicators(text: string): boolean {
    // Check if text contains markdown formatting that needs buffering
    // Include single asterisks and underscores for italic formatting
    return /^[*\-+]\s|^\d+\.\s|^#+\s|\*\*|\*[^*\s]|__|\_[^_\s]|\[.*\]\(.*\)/m.test(
      text,
    )
  }

  private isHeading(text: string): boolean {
    // Check if the text starts with a heading pattern
    return /^#+\s/.test(text.trim())
  }

  private shouldFlushBuffer(): boolean {
    // Don't flush if we're in the middle of a list
    if (this.inList) {
      // Check if the buffer ends with a pattern that suggests the list continues
      const lines = this.normalBuffer.split('\n')
      const lastLine = lines[lines.length - 1] || ''
      const secondLastLine = lines[lines.length - 2] || ''

      // If last line is empty and second last line isn't a list item, list is probably done
      if (lastLine.trim() === '' && secondLastLine.trim() !== '') {
        const isListItem = /^\s*([-*+]|\d+\.)\s/.test(secondLastLine)
        if (!isListItem) {
          return true
        }
      }

      // If we have double newline after a non-list item, flush
      if (this.normalBuffer.includes('\n\n')) {
        const parts = this.normalBuffer.split('\n\n')
        const lastPart = parts[parts.length - 1]
        // Check if the part after double newline is a list
        if (!lastPart.match(/^\s*([-*+]|\d+\.)\s/)) {
          return true
        }
      }

      return false
    }

    // Normal flush conditions when not in a list
    return this.normalBuffer.includes('\n\n')
  }

  private render(md: string): string {
    if (!this.isTTY) return md

    // Always use markdown-it-terminal to render, as it handles both
    // plain text and markdown appropriately without wrapping
    return this.md.render(md)
  }
}
