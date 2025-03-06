import { bold } from 'picocolors'
import { snakeToTitleCase } from 'common/util/string'

// Define handler types
export type TagStartHandler = (attributes: Record<string, string>) => string | null
export type TagContentHandler = (content: string, attributes: Record<string, string>) => string | null
export type TagEndHandler = (attributes: Record<string, string>) => string | null

export interface TagHandler {
  onStart?: TagStartHandler
  onContent?: TagContentHandler
  onEnd?: TagEndHandler
  attributeNames?: string[] // Names of attributes to extract
}

export interface TagHandlers {
  [tagName: string]: TagHandler
}

export interface XmlProcessorState {
  buffer: string
  tagStack: Array<{
    name: string
    attributes: Record<string, string>
    content: string
  }>
  currentAttributes: Record<string, string>
  parsingAttributes: boolean
  attributeName: string
  attributeValue: string
  inQuotes: boolean
  quoteChar: string | null
}

export class XmlStreamProcessor {
  private state: XmlProcessorState
  private handlers: TagHandlers

  constructor(handlers: TagHandlers) {
    this.handlers = handlers
    this.state = this.getInitialState()
  }

  private getInitialState(): XmlProcessorState {
    return {
      buffer: '',
      tagStack: [],
      currentAttributes: {},
      parsingAttributes: false,
      attributeName: '',
      attributeValue: '',
      inQuotes: false,
      quoteChar: null
    }
  }

  process(chunk: string): string {
    this.state.buffer += chunk
    let output = ''
    let position = 0

    // Process the buffer character by character
    while (position < this.state.buffer.length) {
      const char = this.state.buffer[position]
      const nextChar = position + 1 < this.state.buffer.length ? this.state.buffer[position + 1] : ''

      // Opening tag
      if (char === '<' && nextChar !== '/') {
        // Process text before the tag
        const textBeforeTag = this.state.buffer.substring(0, position).trim()
        if (textBeforeTag) {
          output += this.processText(textBeforeTag)
          this.state.buffer = this.state.buffer.substring(position)
          position = 0
          continue
        }

        // Find the end of the tag
        const tagEndPos = this.state.buffer.indexOf('>', position)
        if (tagEndPos === -1) {
          // Incomplete tag, wait for more data
          break
        }

        // Extract tag name and attributes
        const tagContent = this.state.buffer.substring(position + 1, tagEndPos)
        const parts = tagContent.split(/\s+/)
        const tagName = parts[0]
        
        // Parse attributes
        const attributes: Record<string, string> = {}
        let attrStr = tagContent.substring(tagName.length).trim()
        
        // Simple attribute parsing - can be improved for complex cases
        const attrRegex = /([a-z_][a-z0-9_-]*)="([^"]*)"/g
        let match
        while ((match = attrRegex.exec(attrStr)) !== null) {
          attributes[match[1]] = match[2]
        }

        // Process tag start
        this.state.tagStack.push({
          name: tagName,
          attributes,
          content: ''
        })
        
        const handler = this.handlers[tagName]
        if (handler?.onStart) {
          const startOutput = handler.onStart(attributes)
          if (startOutput !== null) {
            output += startOutput
          }
        } else if (!this.isSpecialTag(tagName)) {
          // Default handling for unknown tags
          output += `${bold(snakeToTitleCase(tagName))}: `
        }

        // Remove processed content from buffer
        this.state.buffer = this.state.buffer.substring(tagEndPos + 1)
        position = 0
        continue
      }

      // Closing tag
      if (char === '<' && nextChar === '/') {
        // Process text before the closing tag
        const textBeforeTag = this.state.buffer.substring(0, position).trim()
        if (textBeforeTag && this.state.tagStack.length > 0) {
          const currentTag = this.state.tagStack[this.state.tagStack.length - 1]
          currentTag.content += textBeforeTag
        }

        // Find the end of the closing tag
        const tagEndPos = this.state.buffer.indexOf('>', position)
        if (tagEndPos === -1) {
          // Incomplete tag, wait for more data
          break
        }

        // Extract tag name
        const tagName = this.state.buffer.substring(position + 2, tagEndPos).trim()
        
        // Process tag content and end
        if (this.state.tagStack.length > 0) {
          const currentTag = this.state.tagStack.pop()!
          
          if (currentTag.name === tagName) {
            const handler = this.handlers[tagName]
            
            // Process content
            if (handler?.onContent && currentTag.content) {
              const contentOutput = handler.onContent(currentTag.content, currentTag.attributes)
              if (contentOutput !== null) {
                output += contentOutput
              }
            }
            
            // Process tag end
            if (handler?.onEnd) {
              const endOutput = handler.onEnd(currentTag.attributes)
              if (endOutput !== null) {
                output += endOutput
              }
            }
          }
        }

        // Remove processed content from buffer
        this.state.buffer = this.state.buffer.substring(tagEndPos + 1)
        position = 0
        continue
      }

      // Accumulate content for the current tag
      if (this.state.tagStack.length > 0) {
        position++
      } else {
        // Not inside any tag, process as regular text
        const nextTagPos = this.state.buffer.indexOf('<', position)
        if (nextTagPos === -1) {
          // No more tags in this chunk
          output += this.processText(this.state.buffer)
          this.state.buffer = ''
          break
        } else {
          // Process text up to the next tag
          output += this.processText(this.state.buffer.substring(0, nextTagPos))
          this.state.buffer = this.state.buffer.substring(nextTagPos)
          position = 0
        }
      }
    }

    return output
  }

  private processText(text: string): string {
    if (this.state.tagStack.length === 0) {
      // Not inside any tag, return as is
      return text
    }
    
    // Inside a tag, accumulate content
    const currentTag = this.state.tagStack[this.state.tagStack.length - 1]
    currentTag.content += text
    return ''
  }

  private isSpecialTag(tagName: string): boolean {
    // List of tags that have special handling
    return tagName === 'write_file' || tagName === 'path'
  }

  // Reset the processor state
  reset(): void {
    this.state = this.getInitialState()
  }
}

// Default handlers for common tags
export const defaultTagHandlers: TagHandlers = {
  'write_file': {
    onStart: () => null, // Hide the tag opening
    onContent: () => null, // Hide the content
    onEnd: () => null, // Hide the tag closing
  },
  'path': {
    onStart: () => null,
    onContent: (content) => `${bold('Writing File')}: ${content.trim()}\n`,
    onEnd: () => null,
  }
}

// Helper function to process regular text with XML-like tags
export function processRegularText(text: string): string {
  let processedText = text

  // Handle empty tags: <tag></tag>
  processedText = processedText.replace(
    /<([a-z_][a-z0-9_-]*)(\s+[^>]*)?><\/\1(\s+[^>]*)?>/g,
    ''
  )

  // Handle opening tags
  processedText = processedText.replace(
    /<([a-z_][a-z0-9_-]*)(\s+[^>]*)?>/g,
    (match, tagName) => {
      const readableTagName = snakeToTitleCase(tagName)
      return `${bold(readableTagName)}: `
    }
  )

  // Handle closing tags
  processedText = processedText.replace(
    /<\/([a-z_][a-z0-9_-]*)(\s+[^>]*)?>/g,
    ''
  )

  return processedText
}
