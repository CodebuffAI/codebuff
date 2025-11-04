import React from 'react'

import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

/**
 * UI component for code_search tool.
 * Displays a single line showing the search pattern, flags, and number of results.
 * Does not support expand/collapse - always shows as a single line.
 */
export const CodeSearchComponent = defineToolComponent({
  toolName: 'code_search',
  
  render(toolBlock, theme, options): ToolRenderConfig | null {
    const input = toolBlock.input as any
    const pattern = input?.pattern ?? ''
    const flags = input?.flags ?? ''
    
    // Count results from output
    let totalResults = 0
    let fileCount = 0
    
    if (toolBlock.output && typeof toolBlock.output === 'string') {
      const lines = toolBlock.output.split('\n')
      const files = new Set<string>()
      
      for (const line of lines) {
        const trimmed = line.trim()
        
        // File paths end with a colon and typically start with ./ or /
        if (trimmed.endsWith(':') && (trimmed.startsWith('./') || trimmed.startsWith('/'))) {
          files.add(trimmed.slice(0, -1)) // Remove trailing colon
        }
        // Result lines start with a number followed by a colon
        else if (/^\d+:/.test(trimmed)) {
          totalResults++
        }
      }
      
      fileCount = files.size
    }
    
    // Build single-line summary
    let summary = `"${pattern}"`
    
    if (flags) {
      summary += ` ${flags}`
    }
    
    summary += ` → ${totalResults} result${totalResults === 1 ? '' : 's'}`
    
    if (fileCount > 0) {
      summary += ` across ${fileCount} file${fileCount === 1 ? '' : 's'}`
    }
    
    // Return as content using SimpleToolCallItem
    return {
      content: (
        <SimpleToolCallItem
          name="Code Search"
          description={summary}
          branchChar={options.branchChar}
        />
      ),
    }
  },
})
