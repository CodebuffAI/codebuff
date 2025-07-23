import {
  green,
  yellow,
  cyan,
  magenta,
  bold,
  gray,
  blue,
  italic,
} from 'picocolors'
import { pluralize } from '@codebuff/common/util/string'
import {
  getSubagentData,
  getSubagentFullContent,
  getSubagentFormattedContent,
  getAllSubagentIds,
  getRecentSubagents,
  SubagentData,
} from '../subagent-storage'
import { logger } from '../utils/logger'
import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
  MOVE_CURSOR,
} from '../utils/terminal'
import { enterSubagentListBuffer } from './subagent-list'
import wrapAnsi from 'wrap-ansi'
import stringWidth from 'string-width'

/**
 * Wrap a line to fit within terminal width using robust npm packages
 */
function wrapLine(line: string, terminalWidth: number): string[] {
  if (!line) return ['']

  // Use string-width to check actual display width
  if (stringWidth(line) <= terminalWidth) {
    return [line]
  }

  // Use wrap-ansi for robust ANSI-aware wrapping
  const wrapped = wrapAnsi(line, terminalWidth, { hard: true })
  return wrapped.split('\n')
}

let isInSubagentBuffer = false
let originalKeyHandlers: ((str: string, key: any) => void)[] = []
let scrollOffset = 0
let contentLines: string[] = []
let currentAgentId: string | null = null
let lastContentLength = 0

export function isInSubagentBufferMode(): boolean {
  return isInSubagentBuffer
}

/**
 * Display a formatted list of subagents with enhanced styling
 */
export function displaySubagentList(agents: SubagentData[]) {
  console.log(bold(cyan('🤖 Available Subagents')))
  console.log(gray(`Found ${pluralize(agents.length, 'subagent')}`))
  console.log()
  if (agents.length === 0) {
    console.log(gray('  (none)'))
  } else {
    agents.forEach((agent) => {
      const status = agent.isActive ? green('●') : gray('○')
      const promptPreview = agent.prompt
        ? gray(agent.prompt)
        : gray('(no prompt)')
      console.log(
        `  ${status} ${bold(agent.agentId)} ${gray(`(${agent.agentType})`)}`
      )
      console.log(`    ${promptPreview}`)
      console.log()
    })
  }
}

export function enterSubagentBuffer(
  rl: any,
  agentId: string,
  onExit: () => void
) {
  if (isInSubagentBuffer) {
    console.log(yellow('Already in subagent buffer mode!'))
    return
  }

  // Validate agent ID exists
  const agentData = getSubagentData(agentId)
  if (!agentData) {
    console.log(yellow(`No subagent found with ID: ${agentId}`))
    const recentSubagents = getRecentSubagents(5)
    displaySubagentList(recentSubagents)
    return
  }

  currentAgentId = agentId

  // Reset scroll state to ensure clean start
  scrollOffset = 0
  contentLines = []
  lastContentLength = 0

  // Enter alternate screen buffer
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(MOVE_CURSOR(1, 1)) // Ensure cursor starts at top-left
  process.stdout.write(HIDE_CURSOR)

  isInSubagentBuffer = true

  // Display subagent content
  updateSubagentContent()

  // Set up key handler for ESC to exit
  setupSubagentKeyHandler(rl, onExit)
}

export function exitSubagentBuffer(rl: any) {
  if (!isInSubagentBuffer) {
    return
  }

  // Reset state
  scrollOffset = 0
  contentLines = []
  currentAgentId = null
  lastContentLength = 0

  // Restore all original key handlers
  if (originalKeyHandlers.length > 0) {
    process.stdin.removeAllListeners('keypress')
    originalKeyHandlers.forEach((handler) => {
      process.stdin.on('keypress', handler)
    })
    originalKeyHandlers = []
  }

  // Remove resize listener
  process.stdout.removeAllListeners('resize')

  // Exit alternate screen buffer
  process.stdout.write(SHOW_CURSOR)
  process.stdout.write(EXIT_ALT_BUFFER)

  isInSubagentBuffer = false
}

function updateSubagentContent() {
  if (!currentAgentId) return

  const agentData = getSubagentData(currentAgentId)
  if (!agentData) return

  const fullContent = getSubagentFormattedContent(currentAgentId)

  // Check if content has changed
  if (fullContent.length === lastContentLength) {
    return // No new content
  }
  lastContentLength = fullContent.length

  // Split content into lines and wrap them properly
  const terminalWidth = process.stdout.columns || 80
  const contentBodyLines = fullContent
    ? fullContent.split('\n')
    : ['(no content yet)']

  const wrappedLines: string[] = []

  // Add prompt if exists (but don't duplicate if it's already in the content)
  if (
    agentData.prompt &&
    !fullContent.includes(`Prompt: ${agentData.prompt}`)
  ) {
    const promptLine = bold(gray(`Prompt: ${agentData.prompt}`))
    wrappedLines.push(...wrapLine(promptLine, terminalWidth))
    wrappedLines.push('') // Add spacing after prompt
  }

  // Wrap each content line, preserving empty lines
  for (let i = 0; i < contentBodyLines.length; i++) {
    const line = contentBodyLines[i]
    if (line === '') {
      wrappedLines.push('') // Preserve empty lines
    } else {
      const wrapped = wrapLine(line, terminalWidth)
      wrappedLines.push(...wrapped)
    }
  }

  // Ensure we end with an empty line for spacing
  if (wrappedLines.length > 0 && wrappedLines[wrappedLines.length - 1] !== '') {
    wrappedLines.push('')
  }

  contentLines = wrappedLines

  // Always start at the top when entering a new subagent view
  scrollOffset = 0

  renderSubagentContent()
}

function renderSubagentContent() {
  // Clear screen and move cursor to top
  process.stdout.write(CLEAR_SCREEN)

  const terminalHeight = process.stdout.rows || 24
  const terminalWidth = process.stdout.columns || 80
  const maxLines = terminalHeight - 2 // Leave space for status line

  const totalLines = contentLines.length

  // Calculate visible lines based on scroll offset
  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + maxLines)

  // Display content
  process.stdout.write(visibleLines.join('\n'))

  // Add padding to fill remaining space
  const remainingLines = maxLines - visibleLines.length
  if (remainingLines > 0) {
    process.stdout.write('\n'.repeat(remainingLines))
  }

  // Display status line at bottom
  const statusLine = `\n${gray(`Use ↑/↓/PgUp/PgDn to scroll, ESC to go back`)}`

  process.stdout.write(statusLine)
}

function setupSubagentKeyHandler(rl: any, onExit: () => void) {
  // Store all original key handlers
  const listeners = process.stdin.listeners('keypress')
  originalKeyHandlers = listeners as ((str: string, key: any) => void)[]

  // Remove existing keypress listeners
  process.stdin.removeAllListeners('keypress')

  // Handle terminal resize
  const handleResize = () => {
    // Recalculate content with new terminal dimensions
    updateSubagentContent()
  }

  process.stdout.on('resize', handleResize)

  // Add our custom handler
  process.stdin.on('keypress', (str: string, key: any) => {
    if (key && key.name === 'escape') {
      exitSubagentBuffer(rl)
      // Return to subagent list, preserving the current selection
      enterSubagentListBuffer(rl, onExit)
      return
    }

    // Handle Ctrl+C - exit to main screen instead of exiting program
    if (key && key.ctrl && key.name === 'c') {
      exitSubagentBuffer(rl)
      onExit()
      return
    }

    // Handle scrolling (only when not in chat input mode or using specific scroll keys)
    const terminalHeight = process.stdout.rows || 24
    const maxLines = terminalHeight - 2
    const maxScrollOffset = Math.max(0, contentLines.length - maxLines)

    if (key && key.name === 'up' && !key.meta && !key.ctrl) {
      const newOffset = Math.max(0, scrollOffset - 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'down' && !key.meta && !key.ctrl) {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'pageup') {
      const newOffset = Math.max(0, scrollOffset - maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'pagedown') {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'home') {
      if (scrollOffset !== 0) {
        scrollOffset = 0
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'end') {
      if (scrollOffset !== maxScrollOffset) {
        scrollOffset = maxScrollOffset
        renderSubagentContent()
      }
      return
    }

    // For other keys, just ignore them
  })

  // Ensure raw mode for immediate key detection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    // Force stdin to be readable to ensure keypress events are captured
    process.stdin.resume()
  }
}

/**
 * Update the display if we're currently viewing this agent
 */
export function refreshSubagentDisplay(agentId: string) {
  if (isInSubagentBuffer && currentAgentId === agentId) {
    updateSubagentContent()
  }
}

// Cleanup function to ensure we exit subagent buffer on process termination
export function cleanupSubagentBuffer() {
  if (isInSubagentBuffer) {
    process.stdout.write(SHOW_CURSOR)
    process.stdout.write(EXIT_ALT_BUFFER)
    isInSubagentBuffer = false
  }

  // Restore normal terminal mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}

// Register cleanup on process exit
process.on('exit', cleanupSubagentBuffer)
process.on('SIGINT', cleanupSubagentBuffer)
process.on('SIGTERM', cleanupSubagentBuffer)
