import { pluralize } from '@codebuff/common/util/string'
import { green, yellow, cyan, magenta, bold, gray } from 'picocolors'

import {
  getSubagentsChronological,
  type SubagentData,
} from '../subagent-storage'
import { enterSubagentBuffer } from './traces'
import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
} from '../utils/terminal'

let isInSubagentListBuffer = false
let originalKeyHandlers: ((str: string, key: any) => void)[] = []
// Make selectedIndex persistent across menu transitions
// This maintains selection when navigating between trace list and individual views
let persistentSelectedIndex = -1 // -1 means not initialized
let scrollOffset = 0
let allContentLines: string[] = []
let subagentLinePositions: number[] = []
let subagentList: SubagentData[] = []

export function isInSubagentListMode(): boolean {
  return isInSubagentListBuffer
}

export function enterSubagentListBuffer(rl: any, onExit: () => void) {
  if (isInSubagentListBuffer) {
    console.log(yellow('Already in trace list mode!'))
    return
  }

  // Get traces in chronological order
  subagentList = getSubagentsChronological(50) // Get more for the list

  if (subagentList.length === 0) {
    console.log(yellow('No traces found from previous runs.'))
    console.log(
      gray(
        'Traces will appear here after you use spawn_agents in a conversation.',
      ),
    )
    onExit() // Return control to user
    return
  }

  // Initialize selectedIndex: reset to last item when entering from main screen,
  // or use persistent value if returning from individual trace view
  if (
    persistentSelectedIndex === -1 ||
    persistentSelectedIndex >= subagentList.length
  ) {
    // First time or invalid index - select the most recent trace (last in chronological list)
    persistentSelectedIndex = Math.max(0, subagentList.length - 1)
  }
  // Use the persistent selected index
  const selectedIndex = persistentSelectedIndex

  // Enter alternate screen buffer
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(HIDE_CURSOR)

  isInSubagentListBuffer = true

  // Build content, center the view, and then render
  buildAllContentLines()
  centerSelectedItem()
  renderSubagentList()

  // Set up key handler
  setupSubagentListKeyHandler(rl, onExit)
}

export function exitSubagentListBuffer(rl: any) {
  if (!isInSubagentListBuffer) {
    return
  }

  // Don't reset persistentSelectedIndex here - keep it for next time
  scrollOffset = 0
  allContentLines = []
  subagentLinePositions = []
  subagentList = []

  // Restore all original key handlers
  if (originalKeyHandlers.length > 0) {
    process.stdin.removeAllListeners('keypress')
    originalKeyHandlers.forEach((handler) => {
      process.stdin.on('keypress', handler)
    })
    originalKeyHandlers = []
  }

  // Exit alternate screen buffer
  process.stdout.write(SHOW_CURSOR)
  process.stdout.write(EXIT_ALT_BUFFER)

  isInSubagentListBuffer = false
}

function centerSelectedItem() {
  const selectedIndex = persistentSelectedIndex
  if (selectedIndex < 0 || selectedIndex >= subagentLinePositions.length) {
    return // Safety check
  }

  const terminalHeight = process.stdout.rows || 24
  const terminalWidth = process.stdout.columns || 80
  const headerHeight = getHeaderLines(terminalWidth).length
  const maxScrollableLines = terminalHeight - headerHeight - 2
  const selectedLineIndex = subagentLinePositions[selectedIndex] // No offset needed now
  const maxScrollOffset = Math.max(
    0,
    allContentLines.length - maxScrollableLines,
  )

  // Center item in the scrollable viewport
  const centerOffset = selectedLineIndex - Math.floor(maxScrollableLines / 2)
  scrollOffset = Math.max(0, Math.min(maxScrollOffset, centerOffset))
}

// Define header lines as a separate function
const getHeaderLines = (terminalWidth: number) => [
  bold(cyan('🤖 ')) + bold(magenta('Trace History')),
  gray(`${pluralize(subagentList.length, 'trace run')} `),
  '',
  gray('─'.repeat(terminalWidth)),
  '',
]

function buildAllContentLines() {
  const terminalWidth = process.stdout.columns || 80
  const lines: string[] = []
  subagentLinePositions = [] // Reset before building
  const selectedIndex = persistentSelectedIndex

  if (subagentList.length === 0) {
    lines.push(yellow('No traces found.'))
  } else {
    // Build all content lines for all traces
    for (let i = 0; i < subagentList.length; i++) {
      subagentLinePositions.push(lines.length) // Store the starting line number
      const agent = subagentList[i]
      const isSelected = i === selectedIndex
      const startTime = new Date(agent.startTime).toLocaleTimeString()

      // Show prompt truncated to first 3 lines
      const fullPrompt = agent.prompt || '(no prompt recorded)'
      const maxLineLength = terminalWidth - 12 // Adjusted for consistent padding

      // Wrap the prompt text, handling markdown code blocks properly
      const allPromptLines: string[] = []

      // Check if prompt contains code blocks
      if (fullPrompt.includes('```')) {
        // Handle markdown code blocks specially
        const lines = fullPrompt.split('\n')
        let currentLine = '"' // Start with a quote
        let inCodeBlock = false

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]

          // Check for code block markers
          if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock
          }

          if (inCodeBlock || line.trim().startsWith('```')) {
            // In code block - preserve line as-is but add to current line if possible
            if (currentLine === '"') {
              currentLine = `"${line}`
            } else {
              // Finish current line and start new one
              allPromptLines.push(currentLine)
              currentLine = `  ${line}` // Indent subsequent lines
            }

            // If this is the end of a line in code block, finish it
            if (i < lines.length - 1) {
              allPromptLines.push(currentLine)
              currentLine = '  ' // Start next line with indent
            }
          } else {
            // Regular text - use word wrapping
            const words = line.split(' ')
            for (const word of words) {
              const testLine =
                currentLine === '"' ? `"${word}` : `${currentLine} ${word}`
              if (
                testLine.replace(/\u001b\[[0-9;]*m/g, '').length <=
                maxLineLength
              ) {
                currentLine = testLine
              } else {
                allPromptLines.push(currentLine)
                currentLine = `  ${word}` // Indent subsequent lines
              }
            }

            // If there are more lines, finish current line
            if (i < lines.length - 1 && currentLine.trim() !== '') {
              allPromptLines.push(currentLine)
              currentLine = '  ' // Start next line with indent
            }
          }
        }
        // Add final line
        if (currentLine.trim() !== '' && currentLine !== '  ') {
          allPromptLines.push(currentLine + '"')
        } else if (allPromptLines.length > 0) {
          // Add quote to last line if we have content
          const lastLine = allPromptLines[allPromptLines.length - 1]
          allPromptLines[allPromptLines.length - 1] = lastLine + '"'
        } else {
          allPromptLines.push('""')
        }
      } else {
        // No code blocks - use simple word wrapping
        const words = fullPrompt.split(' ')
        let currentLine = '"' // Start with a quote

        for (const word of words) {
          const testLine = `${currentLine} ${word}`
          if (
            testLine.replace(/\u001b\[[0-9;]*m/g, '').length <= maxLineLength
          ) {
            currentLine = testLine
          } else {
            allPromptLines.push(currentLine)
            currentLine = `  ${word}` // Indent subsequent lines
          }
        }
        allPromptLines.push(currentLine + '"') // End with a quote
      }

      // Truncate to first 3 lines and add ellipsis if needed
      const promptLines = allPromptLines.slice(0, 3)
      if (allPromptLines.length > 3) {
        // Replace the last line with ellipsis
        const lastLine = promptLines[promptLines.length - 1]
        promptLines[promptLines.length - 1] = lastLine.replace('"', '..."')
      }

      const agentInfo = `${bold(agent.agentType)}`
      const timeInfo = agent.isActive
        ? green(`[Active - ${startTime}]`)
        : gray(`[${startTime}]`)
      const creditsDisplay =
        agent.creditsUsed > 0
          ? yellow(` (${pluralize(agent.creditsUsed, 'credit')})`)
          : ''
      const headerLine = `${agentInfo}${creditsDisplay} ${timeInfo}`

      const contentForBox = [headerLine, ...promptLines.map((p) => gray(p))]

      if (isSelected) {
        // Calculate box width based on content, stripping ANSI codes for accurate length
        const maxContentWidth = Math.max(
          ...contentForBox.map(
            (line) => line.replace(/\u001b\[[0-9;]*m/g, '').length,
          ),
        )
        const boxWidth = Math.min(terminalWidth - 6, maxContentWidth)

        // Add top border
        lines.push(`  ${cyan('┌' + '─'.repeat(boxWidth + 2) + '┐')}`)

        // Add content lines with proper padding
        contentForBox.forEach((line) => {
          const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, '')
          const padding = ' '.repeat(Math.max(0, boxWidth - cleanLine.length))
          lines.push(`  ${cyan('│')} ${line}${padding} ${cyan('│')}`)
        })

        // Add bottom border
        lines.push(`  ${cyan('└' + '─'.repeat(boxWidth + 2) + '┘')}`)
      } else {
        // Correctly render non-selected items
        lines.push(`  ${headerLine}`)
        promptLines.forEach((p) => {
          lines.push(`  ${gray(p)}`)
        })
      }

      if (i < subagentList.length - 1) {
        lines.push('') // Empty line between items
      }
    }
  }

  allContentLines = lines
}

function renderSubagentList() {
  // Build all content if not already built or if selection changed
  buildAllContentLines()

  // Clear screen and move cursor to top
  process.stdout.write(CLEAR_SCREEN)

  const terminalHeight = process.stdout.rows || 24
  const terminalWidth = process.stdout.columns || 80

  // Render fixed header
  const headerLines = getHeaderLines(terminalWidth)
  process.stdout.write(headerLines.join('\n'))
  process.stdout.write('\n')

  // Render scrollable content
  const maxScrollableLines = terminalHeight - headerLines.length - 2 // Leave space for header and status line
  const visibleLines = allContentLines.slice(
    scrollOffset,
    scrollOffset + maxScrollableLines,
  )

  // Display scrollable content
  process.stdout.write(visibleLines.join('\n'))

  // Add padding to fill remaining space
  const remainingLines = maxScrollableLines - visibleLines.length
  if (remainingLines > 0) {
    process.stdout.write('\n'.repeat(remainingLines))
  }

  // Display status line at bottom
  // Update: mention ESC or q
  const statusLine = `\n${gray(`Use ↑/↓/j/k to navigate, PgUp/PgDn for fast scroll, Enter to view, ESC or q to go back`)}`

  process.stdout.write(statusLine)
  process.stdout.write(HIDE_CURSOR)
}

function setupSubagentListKeyHandler(rl: any, onExit: () => void) {
  // Store all original key handlers
  const listeners = process.stdin.listeners('keypress')
  originalKeyHandlers = listeners as ((str: string, key: any) => void)[]

  // Remove existing keypress listeners
  process.stdin.removeAllListeners('keypress')

  // Add our custom handler
  process.stdin.on('keypress', (str: string, key: any) => {
    // Support ESC or 'q' (no ctrl/meta) to go back
    if (
      (key && key.name === 'escape') ||
      (!key?.ctrl && !key?.meta && str === 'q')
    ) {
      exitSubagentListBuffer(rl)
      onExit()
      return
    }

    // Handle Ctrl+C - exit to main screen instead of exiting program
    if (key && key.ctrl && key.name === 'c') {
      exitSubagentListBuffer(rl)
      onExit()
      return
    }

    // Handle Enter - select current trace
    if (key && key.name === 'return') {
      if (
        subagentList.length > 0 &&
        persistentSelectedIndex < subagentList.length
      ) {
        const selectedAgent = subagentList[persistentSelectedIndex]
        exitSubagentListBuffer(rl)

        // Enter the individual trace buffer
        enterSubagentBuffer(rl, selectedAgent.agentId, onExit)
      }
      return
    }

    // Handle carousel-style navigation - all scroll keys move between items
    if (key && (key.name === 'up' || key.name === 'k')) {
      if (persistentSelectedIndex > 0) {
        persistentSelectedIndex--
        // Center the selected item
        centerSelectedItem()
        renderSubagentList()
      }
      return
    }

    if (key && (key.name === 'down' || key.name === 'j')) {
      if (persistentSelectedIndex < subagentList.length - 1) {
        persistentSelectedIndex++
        // Center the selected item
        centerSelectedItem()
        renderSubagentList()
      }
      return
    }

    if (key && key.name === 'pageup') {
      const newIndex = Math.max(0, persistentSelectedIndex - 5) // Jump 5 items up
      if (newIndex !== persistentSelectedIndex) {
        persistentSelectedIndex = newIndex
        centerSelectedItem()
        renderSubagentList()
      }
      return
    }

    if (key && key.name === 'pagedown') {
      const newIndex = Math.min(
        subagentList.length - 1,
        persistentSelectedIndex + 5,
      ) // Jump 5 items down
      if (newIndex !== persistentSelectedIndex) {
        persistentSelectedIndex = newIndex
        centerSelectedItem()
        renderSubagentList()
      }
      return
    }

    if (key && key.name === 'home') {
      if (persistentSelectedIndex !== 0) {
        persistentSelectedIndex = 0
        centerSelectedItem()
        renderSubagentList()
      }
      return
    }

    if (key && key.name === 'end') {
      if (persistentSelectedIndex !== subagentList.length - 1) {
        persistentSelectedIndex = subagentList.length - 1
        centerSelectedItem()
        renderSubagentList()
      }
      return
    }
  })

  // Ensure raw mode for immediate key detection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
}

// Export function to reset selection to last item (for main screen entry)
export function resetSubagentSelectionToLast() {
  persistentSelectedIndex = -1 // This will trigger reset to last item on next entry
}

// Cleanup function to ensure we exit trace list buffer on process termination
export function cleanupSubagentListBuffer() {
  if (isInSubagentListBuffer) {
    process.stdout.write(SHOW_CURSOR)
    process.stdout.write(EXIT_ALT_BUFFER)
    isInSubagentListBuffer = false
  }

  // Restore normal terminal mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}

// Register cleanup on process exit
process.on('exit', cleanupSubagentListBuffer)
process.on('SIGINT', cleanupSubagentListBuffer)
process.on('SIGTERM', cleanupSubagentListBuffer)
