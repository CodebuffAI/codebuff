import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

/**
 * UI component for read_docs tool.
 * Displays library name and topic in a compact format.
 * Does not support expand/collapse - always shows as a simple line.
 */
export const ReadDocsComponent = defineToolComponent({
  toolName: 'read_docs',

  render(toolBlock): ToolRenderConfig {
    const input = toolBlock.input as any

    // Extract library and topic from input
    const libraryTitle =
      typeof input?.libraryTitle === 'string' ? input.libraryTitle.trim() : ''
    const topic = typeof input?.topic === 'string' ? input.topic.trim() : ''

    if (!libraryTitle && !topic) {
      return { content: null }
    }

    const description =
      libraryTitle && topic
        ? `${libraryTitle}: ${topic}`
        : libraryTitle || topic

    return {
      content: (
        <SimpleToolCallItem name="Read Docs" description={description} />
      ),
    }
  },
})
