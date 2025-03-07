import { TOOL_LIST, type ToolName } from 'common/constants/tools'
import { snakeToTitleCase } from 'common/util/string'
import { bold } from 'picocolors'

/**
 * Formats a tag name for display in the terminal
 * @param tagName The name of the tag to format
 * @returns Formatted tag name with proper styling
 */
const formatTagName = (tagName: string): string => {
  return `\n[${bold(snakeToTitleCase(tagName))}] `
}

/**
 * Handler interface for XML tags
 * Allows controlling both tag display and content handling
 */
export interface TagHandler {
  // Called when an opening tag is encountered
  // Return null to hide the tag, or a string to replace it
  onTagStart?: (tagName: string) => string | null

  // Called when a nested tag is completed
  // Return null to hide the content, or a string to replace it
  onTagEnd: (tagName: string, content: string) => string | null
}

/**
 * XmlStreamProcessor handles XML tags that may be split across multiple chunks.
 * It processes tool-related XML tags and executes callbacks when nested tags are completed.
 */
export class XmlStreamProcessor {
  private tagStack: string[] = []
  private currentContent: string = ''
  private tagHandlers: Record<string, TagHandler>
  private processedLength: number = 0
  private lastOutput: string = ''

  constructor(tagHandlers: Record<string, TagHandler>) {
    this.tagHandlers = tagHandlers
  }

  /**
   * Process a buffer of text that may contain XML tags
   * @param buffer The complete buffer to process
   * @returns Processed text with XML tags handled according to the tag handlers
   */
  process(buffer: string): string {
    // Only process new content since last call
    const newContent = buffer.slice(this.processedLength)
    if (!newContent) {
      return ''
    }

    // Process the entire buffer
    let output = this.lastOutput
    let position = this.processedLength

    // Look for opening and closing tags in the buffer
    while (position < buffer.length) {
      // Look for opening tag
      const openTagMatch = buffer.slice(position).match(/<([a-zA-Z_]+)>/)

      // Look for closing tag
      const closeTagMatch = buffer.slice(position).match(/<\/([a-zA-Z_]+)>/)

      if (this.tagStack.length === 0) {
        // Not inside any tag - look for opening tag or add text to output
        if (openTagMatch && openTagMatch.index !== undefined) {
          // Add text before the tag to output
          output += buffer.slice(position, position + openTagMatch.index)

          // Get tag name
          const tagName = openTagMatch[1]

          // Handle opening tag display
          const handler = this.tagHandlers[tagName]

          if (handler && handler.onTagStart) {
            const tagDisplay = handler.onTagStart(tagName)
            if (tagDisplay !== null) {
              output += tagDisplay
            }
          }

          // Move position to after the opening tag
          position += openTagMatch.index + openTagMatch[0].length

          // Push tag name to stack
          this.tagStack.push(tagName)
          this.currentContent = ''
        } else {
          // No opening tag found, add remaining text to output
          output += buffer.slice(position)
          position = buffer.length
        }
      } else {
        // Inside a tag - look for nested opening tag or closing tag
        if (
          openTagMatch &&
          closeTagMatch &&
          openTagMatch.index !== undefined &&
          closeTagMatch.index !== undefined
        ) {
          // Both opening and closing tags found, check which comes first
          if (openTagMatch.index < closeTagMatch.index) {
            // Opening tag comes first
            this.currentContent += buffer.slice(
              position,
              position + openTagMatch.index
            )
            position += openTagMatch.index + openTagMatch[0].length
            this.tagStack.push(openTagMatch[1])
          } else {
            // Closing tag comes first
            this.currentContent += buffer.slice(
              position,
              position + closeTagMatch.index
            )
            position += closeTagMatch.index + closeTagMatch[0].length
            const result = this.handleClosingTag(closeTagMatch[1])
            if (result !== null) {
              output += result
            }
          }
        } else if (closeTagMatch && closeTagMatch.index !== undefined) {
          // Only closing tag found
          this.currentContent += buffer.slice(
            position,
            position + closeTagMatch.index
          )
          position += closeTagMatch.index + closeTagMatch[0].length
          const result = this.handleClosingTag(closeTagMatch[1])
          if (result !== null) {
            output += result
          }
        } else if (openTagMatch && openTagMatch.index !== undefined) {
          // Only opening tag found
          this.currentContent += buffer.slice(
            position,
            position + openTagMatch.index
          )
          position += openTagMatch.index + openTagMatch[0].length
          this.tagStack.push(openTagMatch[1])
        } else {
          // No tags found, add everything to current content
          this.currentContent += buffer.slice(position)
          position = buffer.length
        }
      }
    }

    // Update processed length and last output
    this.processedLength = position

    // Calculate new output since last call
    const newOutput = output.slice(this.lastOutput.length)
    this.lastOutput = output

    return newOutput
  }

  private handleClosingTag(tagName: string): string | null {
    // Check if this closing tag matches the current tag on the stack
    if (this.tagStack.length > 0) {
      const currentTag = this.tagStack.pop()

      // If tag names don't match, attempt to recover by ignoring this closing tag
      if (currentTag !== tagName) {
        // Push the popped tag back onto the stack
        if (currentTag) {
          this.tagStack.push(currentTag)
        }
        return null
      }

      // If we're closing a nested tag
      if (this.tagStack.length === 1) {
        const parentTag = this.tagStack[0]
        const handler = this.tagHandlers[parentTag]

        if (handler) {
          const result = handler.onTagEnd(tagName, this.currentContent)
          return result
        }
      }

      // If we're closing the main tag, reset content
      if (this.tagStack.length === 0) {
        this.currentContent = ''
      }
    }

    return null
  }
}

/**
 * Default tag handlers for common XML tags
 */
export const defaultTagHandlers: Record<string, TagHandler> = {
  // Create handlers for each tool in TOOL_LIST
  ...Object.fromEntries(
    TOOL_LIST.map((tool) => [
      tool,
      {
        onTagStart: (tagName) => formatTagName(tagName),
        onTagEnd: (_tagName, _content) => null, // Hide all nested tags by default
      },
    ])
  ),

  add_subgoal: {
    onTagStart: (tagName) => formatTagName(tagName),
    onTagEnd: (tagName, content) => {
      if (tagName === 'objective') {
        return content
      }
      return null
    },
  },

  update_subgoal: {
    onTagStart: (tagName) => formatTagName(tagName),
    onTagEnd: (tagName, content) => {
      if (tagName === 'objective') {
        return content
      }
      return null
    },
  },

  end_turn: {
    onTagStart: () => null,
    onTagEnd: () => null,
  },

  // Override with specific handlers for tools that need special handling
  write_file: {
    onTagStart: (tagName) => formatTagName(tagName),
    onTagEnd: (tagName, content) => {
      // hide content tags
      if (tagName === 'path') {
        return content
      }
      return null
    },
  },

  run_terminal_command: {
    onTagStart: (tagName) => formatTagName(tagName),
    onTagEnd: (tagName, content) => {
      return content
    },
  },

  read_files: {
    onTagStart: (tagName) => formatTagName(tagName),
    onTagEnd: (tagName, content) => {
      // Hide paths tag
      if (tagName === 'paths') {
        return content.split('\n').join(',')
      }
      return content
    },
  },

  find_files: {
    onTagStart: (tagName) => formatTagName(tagName),
    onTagEnd: (tagName, content) => {
      return content
    },
  },

  code_search: {
    onTagStart: (tagName) => formatTagName(tagName),
    onTagEnd: (tagName, content) => {
      // Hide pattern tag
      if (tagName === 'pattern') {
        return null
      }
      return content
    },
  },
}
