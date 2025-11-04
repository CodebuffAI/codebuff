import React from 'react'

import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

/**
 * UI component for list_directory tool.
 * Displays a single line showing the directories being listed.
 * Does not support expand/collapse - always shows as a single line.
 */
export const ListDirectoryComponent = defineToolComponent({
  toolName: 'list_directory',
  
  render(toolBlock, theme, options): ToolRenderConfig | null {
    const input = toolBlock.input as any
    
    // Extract directories from input
    let directories: string[] = []
    
    if (Array.isArray(input?.directories)) {
      directories = input.directories
        .map((dir: any) => typeof dir === 'object' && dir.path ? dir.path : dir)
        .filter((path: any) => typeof path === 'string' && path.trim().length > 0)
    } else if (typeof input?.path === 'string' && input.path.trim().length > 0) {
      directories = [input.path.trim()]
    }
    
    if (directories.length === 0) {
      return null
    }
    
    // Format directory list
    const description = directories.join(', ')
    
    return {
      content: (
        <SimpleToolCallItem
          name="List Directories"
          description={description}
          branchChar={options.branchChar}
        />
      ),
    }
  },
})
