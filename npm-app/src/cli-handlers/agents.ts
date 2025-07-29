import { green, yellow, cyan, magenta, bold, gray, blue, red } from 'picocolors'
import { pluralize } from '@codebuff/common/util/string'
import {
  filterCustomAgentFiles,
  extractAgentIdFromFileName,
} from '@codebuff/common/util/agent-file-utils'
import { AGENT_TEMPLATES_DIR } from '@codebuff/common/constants'
import { loadLocalAgents, getLoadedAgentNames } from '../agents/load-agents'
import { CLI } from '../cli'
import { Spinner } from '../utils/spinner'
import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
  MOVE_CURSOR,
} from '../utils/terminal'
import * as fs from 'fs'
import * as path from 'path'
import { getProjectRoot } from '../project-files'
import { cleanupMiniChat } from './mini-chat'
import {
  startAgentCreationChat,
  createAgentFromRequirements,
} from './agent-creation-chat'

let isInAgentsBuffer = false
let originalKeyHandlers: ((str: string, key: any) => void)[] = []
let selectedIndex = 0
let scrollOffset = 0
let allContentLines: string[] = []
let agentLinePositions: number[] = []
let agentList: Array<{
  id: string
  name: string
  description?: string
  isBuiltIn: boolean
  filePath?: string
  isCreateNew?: boolean
}> = []

export function isInAgentsMode(): boolean {
  return isInAgentsBuffer
}

export async function enterAgentsBuffer(rl: any, onExit: () => void) {
  if (isInAgentsBuffer) {
    console.log(yellow('Already in agents mode!'))
    return
  }

  // Load local agents
  await loadLocalAgents({ verbose: false })
  const localAgents = getLoadedAgentNames()

  // Build agent list with create new option at top
  agentList = [
    {
      id: '__create_new__',
      name: '+ Create New Agent',
      description: 'Create a new custom agent template',
      isBuiltIn: false,
      isCreateNew: true,
    },
  ]

  // Add local agents from .agents/templates
  const agentsDir = path.join(getProjectRoot(), AGENT_TEMPLATES_DIR)
  if (fs.existsSync(agentsDir)) {
    const files = fs.readdirSync(agentsDir)
    const customAgentFiles = filterCustomAgentFiles(files)

    for (const file of customAgentFiles) {
      const agentId = extractAgentIdFromFileName(file)
      const agentName = localAgents[agentId] || agentId
      agentList.push({
        id: agentId,
        name: agentName,
        description: 'Custom user-defined agent',
        isBuiltIn: false,
        filePath: path.join(agentsDir, file),
      })
    }
  }

  if (agentList.length === 1 && agentList[0].isCreateNew) {
    // Only the create new option
    console.log(yellow(`No custom agents found in ${AGENT_TEMPLATES_DIR}`))
    console.log(gray('Press Enter on "Create New Agent" to get started.'))
    // Don't return - still show the create new option
  }

  // Initialize selection
  selectedIndex = 0
  scrollOffset = 0

  // Enter alternate screen buffer
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(HIDE_CURSOR)

  isInAgentsBuffer = true

  // Build content and render
  buildAllContentLines()
  centerSelectedItem()
  renderAgentsList()

  // Set up key handler
  setupAgentsKeyHandler(rl, onExit)
}

export function exitAgentsBuffer(rl: any) {
  if (!isInAgentsBuffer) {
    return
  }

  // Reset state
  selectedIndex = 0
  scrollOffset = 0
  allContentLines = []
  agentLinePositions = []
  agentList = []

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

  isInAgentsBuffer = false
}

function centerSelectedItem() {
  if (selectedIndex < 0 || selectedIndex >= agentLinePositions.length) {
    return
  }

  const terminalHeight = process.stdout.rows || 24
  const terminalWidth = process.stdout.columns || 80
  const headerHeight = getHeaderLines(terminalWidth).length
  const maxScrollableLines = terminalHeight - headerHeight - 2
  const selectedLineIndex = agentLinePositions[selectedIndex]
  const maxScrollOffset = Math.max(
    0,
    allContentLines.length - maxScrollableLines
  )

  // Center item in the scrollable viewport
  const centerOffset = selectedLineIndex - Math.floor(maxScrollableLines / 2)
  scrollOffset = Math.max(0, Math.min(maxScrollOffset, centerOffset))
}

const getHeaderLines = (terminalWidth: number) => [
  bold(cyan('🤖 ')) + bold(magenta('Agent Templates')),
  gray(
    `${pluralize(Math.max(0, agentList.length - 1), 'custom agent')} in ${AGENT_TEMPLATES_DIR}`
  ),
  '',
  gray('─'.repeat(terminalWidth)),
  '',
]

function buildAllContentLines() {
  const terminalWidth = process.stdout.columns || 80
  const lines: string[] = []
  agentLinePositions = []

  if (agentList.length === 0) {
    lines.push(yellow('No agents found.'))
  } else {
    for (let i = 0; i < agentList.length; i++) {
      agentLinePositions.push(lines.length)
      const agent = agentList[i]
      const isSelected = i === selectedIndex

      const agentInfo = agent.isCreateNew
        ? `${green(agent.name)}`
        : `${bold(agent.name)} ${gray(`(${agent.id})`)}`
      const description = agent.description || 'No description'
      const filePath = agent.filePath
        ? gray(`File: ${path.relative(getProjectRoot(), agent.filePath)}`)
        : ''

      const contentForBox = [
        agentInfo,
        gray(description),
        ...(filePath ? [filePath] : []),
      ]

      if (isSelected) {
        // Calculate box width based on content
        const maxContentWidth = Math.max(
          ...contentForBox.map(
            (line) => line.replace(/\u001b\[[0-9;]*m/g, '').length
          )
        )
        const boxWidth = Math.min(terminalWidth - 6, maxContentWidth)

        // Add top border
        lines.push(`  ${cyan('┌' + '─'.repeat(boxWidth + 2) + '┐')}`)

        // Add content lines with proper padding - keep same indentation as unselected
        contentForBox.forEach((line) => {
          const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, '')
          const padding = ' '.repeat(Math.max(0, boxWidth - cleanLine.length))
          lines.push(`  ${cyan('│')} ${line}${padding} ${cyan('│')}`)
        })

        // Add bottom border
        lines.push(`  ${cyan('└' + '─'.repeat(boxWidth + 2) + '┘')}`)
      } else {
        // Non-selected items - use same base indentation as selected content
        lines.push(`    ${agentInfo}`) // 4 spaces to match selected content position
        lines.push(`    ${gray(description)}`)
        if (filePath) {
          lines.push(`    ${filePath}`)
        }
      }

      if (i < agentList.length - 1) {
        lines.push('') // Empty line between items
      }
    }
  }

  allContentLines = lines
}

function renderAgentsList() {
  // Build all content if not already built
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
  const maxScrollableLines = terminalHeight - headerLines.length - 2
  const visibleLines = allContentLines.slice(
    scrollOffset,
    scrollOffset + maxScrollableLines
  )

  // Display scrollable content
  process.stdout.write(visibleLines.join('\n'))

  // Add padding to fill remaining space
  const remainingLines = maxScrollableLines - visibleLines.length
  if (remainingLines > 0) {
    process.stdout.write('\n'.repeat(remainingLines))
  }

  // Display status line at bottom
  const statusLine = `\n${gray(`Use ↑/↓/j/k to navigate, Enter to select, n to create new, ESC to go back`)}`

  process.stdout.write(statusLine)
  process.stdout.write(HIDE_CURSOR)
}

function setupAgentsKeyHandler(rl: any, onExit: () => void) {
  // Store all original key handlers
  const listeners = process.stdin.listeners('keypress')
  originalKeyHandlers = listeners as ((str: string, key: any) => void)[]

  // Remove existing keypress listeners
  process.stdin.removeAllListeners('keypress')

  // Add our custom handler
  process.stdin.on('keypress', (str: string, key: any) => {
    if (key && key.name === 'escape') {
      exitAgentsBuffer(rl)
      onExit()
      return
    }

    // Handle Ctrl+C - exit to main screen
    if (key && key.ctrl && key.name === 'c') {
      exitAgentsBuffer(rl)
      onExit()
      return
    }

    // Handle Enter - switch to selected agent or create new
    if (key && key.name === 'return') {
      if (agentList.length > 0 && selectedIndex < agentList.length) {
        const selectedAgent = agentList[selectedIndex]
        if (selectedAgent.isCreateNew) {
          exitAgentsBuffer(rl)
          startAgentCreationChat(rl, onExit, () => {})
        } else {
          exitAgentsBuffer(rl)
          // Start spinner for agent switching
          Spinner.get().start(`Switching to agent: ${selectedAgent.name}...`)

          // Use resetAgent to switch to the selected agent
          const cliInstance = CLI.getInstance()
          cliInstance
            .resetAgent(selectedAgent.id)
            .then(() => {
              cliInstance.freshPrompt()
            })
            .catch((error) => {
              Spinner.get().stop()
              console.error(red('Error switching to agent:'), error)
              onExit()
            })
        }
      }
      return
    }

    // Handle 'n' key - create new agent
    if (key && key.name === 'n') {
      exitAgentsBuffer(rl)
      startAgentCreationChat(rl, onExit, () => {})
      return
    }

    // Handle navigation
    if (key && (key.name === 'up' || key.name === 'k')) {
      if (selectedIndex > 0) {
        selectedIndex--
        centerSelectedItem()
        renderAgentsList()
      }
      return
    }

    if (key && (key.name === 'down' || key.name === 'j')) {
      if (selectedIndex < agentList.length - 1) {
        selectedIndex++
        centerSelectedItem()
        renderAgentsList()
      }
      return
    }

    if (key && key.name === 'pageup') {
      const newIndex = Math.max(0, selectedIndex - 5)
      if (newIndex !== selectedIndex) {
        selectedIndex = newIndex
        centerSelectedItem()
        renderAgentsList()
      }
      return
    }

    if (key && key.name === 'pagedown') {
      const newIndex = Math.min(agentList.length - 1, selectedIndex + 5)
      if (newIndex !== selectedIndex) {
        selectedIndex = newIndex
        centerSelectedItem()
        renderAgentsList()
      }
      return
    }

    if (key && key.name === 'home') {
      if (selectedIndex !== 0) {
        selectedIndex = 0
        centerSelectedItem()
        renderAgentsList()
      }
      return
    }

    if (key && key.name === 'end') {
      if (selectedIndex !== agentList.length - 1) {
        selectedIndex = agentList.length - 1
        centerSelectedItem()
        renderAgentsList()
      }
      return
    }
  })

  // Ensure raw mode for immediate key detection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
}

function startAgentCreationChatHandler(rl: any, onExit: () => void) {
  startAgentCreationChat(rl, onExit, async (requirements) => {
    await createAgentFromRequirements(requirements)
    onExit()
  })
}

// Cleanup function
export function cleanupAgentsBuffer() {
  if (isInAgentsBuffer) {
    process.stdout.write(SHOW_CURSOR)
    process.stdout.write(EXIT_ALT_BUFFER)
    isInAgentsBuffer = false
  }

  // Restore normal terminal mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
  // Register cleanup on process exit
  process.on('exit', cleanupAgentsBuffer)
  process.on('SIGINT', cleanupAgentsBuffer)
  process.on('SIGTERM', cleanupAgentsBuffer)
}
