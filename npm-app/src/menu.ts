import * as fs from 'fs'
import os from 'os'
import path from 'path'

import { CostMode } from 'common/constants'
import {
  blueBright,
  bold,
  cyan,
  green,
  magenta,
  underline,
  yellow,
} from 'picocolors'

import { getProjectRoot } from './project-files'

export interface CommandInfo {
  commandText: string // e.g., 'type "login"', 'type "diff" or "d"', 'hit ESC key or Ctrl-C'
  description: string
  baseCommand?: string // The actual command keyword, e.g., "login", "diff", "undo"
  params?: string // e.g. "<id>" for checkpoint, "<cmd>" for shell
  isSlashCommand?: boolean // True if it can be invoked with /
  aliases?: string[] // e.g. ["d"] for diff
}

export const interactiveCommandDetails: CommandInfo[] = [
  {
    baseCommand: 'help',
    description: 'Display help information',
    isSlashCommand: true,
    commandText: '', // Empty commandText ensures it's not shown in the main interactive list
    aliases: ['h'], // Optional: if you want /h to also work for tab completion
  },
  {
    commandText: '"login"',
    baseCommand: 'login',
    description: 'Authenticate your session',
    isSlashCommand: true,
  },
  {
    commandText: '"init"',
    baseCommand: 'init',
    description: 'Configure project for better results',
    isSlashCommand: true,
  },
  {
    commandText: '"diff" or "d"',
    baseCommand: 'diff',
    aliases: ['d'],
    description: 'Show last assistant change diff',
    isSlashCommand: true,
  },
  {
    commandText: '"undo" / "redo"',
    description: 'Revert or re-apply last change',
    // This entry will be expanded into two slash commands: /undo and /redo
  },
  {
    commandText: '"checkpoint <id>"',
    baseCommand: 'checkpoint',
    params: '<id>',
    description: 'Restore to a specific checkpoint',
    isSlashCommand: true,
  },
  {
    commandText: '"!<cmd>"',
    baseCommand: '!', // Or handle this specially, e.g. baseCommand 'shell'
    params: '<cmd>',
    description: 'Run shell command directly',
    isSlashCommand: false, // e.g. /! <cmd> or /shell <cmd>
  },
  {
    commandText: '"usage" or "credits"',
    description: 'View remaining / bonus AI credits',
    // This entry will be expanded into two slash commands: /usage and /credits
  },
  {
    commandText: 'ESC key or Ctrl-C',
    description: 'Cancel generation',
    isSlashCommand: false,
  },
  {
    baseCommand: 'undo',
    description: 'Undo last change',
    isSlashCommand: true,
    commandText: '',
  }, // commandText empty as it's covered by "undo / redo" for main menu
  {
    baseCommand: 'redo',
    description: 'Redo last undone change',
    isSlashCommand: true,
    commandText: '',
  },
  {
    baseCommand: 'usage',
    description: 'View AI credits usage',
    isSlashCommand: true,
    commandText: '',
  },
  {
    baseCommand: 'credits',
    description: 'View AI credits balance',
    isSlashCommand: false,
    commandText: '',
  },
  {
    commandText: '"exit" or Ctrl-C x2',
    baseCommand: 'exit',
    description: 'Quit Codebuff',
    isSlashCommand: true,
  },
]

export function getSlashCommands(): CommandInfo[] {
  return interactiveCommandDetails.filter(
    (cmd) => cmd.isSlashCommand && cmd.baseCommand
  )
}

export function displaySlashCommandGrid() {
  const commands = getSlashCommands()
  const commandStrings = commands.map((cmd) => {
    let str = `/${cmd.baseCommand}`
    if (cmd.params) {
      str += ` ${cmd.params}`
    }
    return str
  })

  const termWidth = process.stdout.columns || 80
  const PADDING = 2 // Space between columns
  if (commandStrings.length === 0) {
    return
  }

  const maxCmdLength = Math.max(...commandStrings.map((cmd) => cmd.length))
  const colWidth = maxCmdLength + PADDING
  const numCols = Math.max(1, Math.floor(termWidth / colWidth))

  let output = ''
  for (let i = 0; i < commandStrings.length; i += numCols) {
    const rowCommands = commandStrings.slice(i, i + numCols)
    output +=
      rowCommands.map((cmd) => cyan(cmd.padEnd(colWidth))).join('') + '\n'
  }
  console.log(`\n${output}`)
}

export function displayGreeting(costMode: CostMode, username: string | null) {
  // Show extra info only for logged in users
  const costModeDescription = {
    lite: bold(yellow('Lite mode ✨ enabled')),
    normal: '',
    max: bold(blueBright('Max mode️ ⚡ enabled')),
    experimental: bold(magenta('Experimental mode 🧪 enabled')),
  }
  if (costModeDescription[costMode]) {
    console.log(`${costModeDescription[costMode]}`)
  }

  if (getProjectRoot() === os.homedir()) {
    console.info(
      `Welcome! Codebuff is a coding agent you can prompt with natural language.

To get started:
1. cd into a project you want to edit
2. run "codebuff"
`.trim()
    )
    process.exit()
  }

  console.log(
    `Codebuff will read and write files in "${getProjectRoot()}". Type "help" for a list of commands.`
  )
  const gitDir = path.join(getProjectRoot(), '.git')
  if (!fs.existsSync(gitDir)) {
    console.info(
      magenta(
        "Just fyi, this project doesn't contain a .git directory (are you at the top level of your project?). Codebuff works best with a git repo!"
      )
    )
  }

  console.log(
    `\nWelcome${username ? ` back ${username}` : ''}! What would you like to do?`
  )
}

export function displayMenu() {
  const terminalWidth = process.stdout.columns || 80
  const dividerLine = '─'.repeat(terminalWidth)

  const colorizeRandom = (text: string) => {
    const colorFunctions = [blueBright, green, yellow, magenta, cyan]
    return text
      .split('')
      .map((char) => {
        const colorFn =
          colorFunctions[Math.floor(Math.random() * colorFunctions.length)]
        return colorFn(char)
      })
      .join('')
  }

  console.log(`
${colorizeRandom('          ')}
${colorizeRandom('██████╗')}${colorizeRandom(' ██████╗  ')}${colorizeRandom('██████╗ ')}${colorizeRandom('███████╗')}${colorizeRandom('██████╗ ')}${colorizeRandom('██╗   ██╗')}${colorizeRandom('███████╗')}${colorizeRandom('███████╗')}
${colorizeRandom('██╔════╝')}${colorizeRandom('██╔═══██╗')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██╔════╝')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██║   ██║')}${colorizeRandom('██╔════╝')}${colorizeRandom('██╔════╝')}
${colorizeRandom('██║     ')}${colorizeRandom('██║   ██║')}${colorizeRandom('██║  ██║')}${colorizeRandom('█████╗  ')}${colorizeRandom('██████╔╝')}${colorizeRandom('██║   ██║')}${colorizeRandom('█████╗  ')}${colorizeRandom('█████╗  ')}
${colorizeRandom('██║     ')}${colorizeRandom('██║   ██║')}${colorizeRandom('██║  ██║')}${colorizeRandom('██╔══╝  ')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██║   ██║')}${colorizeRandom('██╔══╝  ')}${colorizeRandom('██╔══╝  ')}
${colorizeRandom('╚██████╗')}${colorizeRandom('╚██████╔╝')}${colorizeRandom('██████╔╝')}${colorizeRandom('███████╗')}${colorizeRandom('██████╔╝')}${colorizeRandom('╚██████╔╝')}${colorizeRandom('██║     ')}${colorizeRandom('██║     ')}
${colorizeRandom(' ╚═════╝')}${colorizeRandom(' ╚═════╝ ')}${colorizeRandom('╚═════╝ ')}${colorizeRandom('╚══════╝')}${colorizeRandom('╚═════╝ ')}${colorizeRandom(' ╚═════╝ ')}${colorizeRandom('╚═╝     ')}${colorizeRandom('╚═╝     ')}
`)

  console.log(
    `\n${bold('Your AI pair programmer that understands, edits, and improves your codebase through natural conversation.')}`
  )

  console.log(`\n${bold(underline('PROJECT SETUP'))}`)

  console.log(
    (() => {
      const currentDirectoryLine = `${green('✅ Current directory:')} ${bold(blueBright(getProjectRoot()))}`
      const hasGitRepo = fs.existsSync(path.join(getProjectRoot(), '.git'))
      const hasGitIgnore = fs.existsSync(
        path.join(getProjectRoot(), '.gitignore')
      )
      const hasKnowledgeMd = fs.existsSync(
        path.join(getProjectRoot(), 'knowledge.md')
      )
      const hasCodebuffJson = fs.existsSync(
        path.join(getProjectRoot(), 'codebuff.json')
      )
      const gitignoreNote =
        ' (Codebuff never reads files in your .gitignore/.codebuffignore)'

      // Condition 1: Git repo found, all files present
      if (hasGitRepo && hasGitIgnore && hasKnowledgeMd && hasCodebuffJson) {
        return `${currentDirectoryLine}\n${green('✅ Git repo: detected')}
${green('✅ .gitignore: detected')}${gitignoreNote}
${green('✅ knowledge.md: detected')}
${green('✅ codebuff.json: detected')}`
      }

      // Condition 2: Git repo not found
      if (!hasGitRepo) {
        return `${currentDirectoryLine}\n${yellow('❌ Git repo: not found - navigate to a working directory!')}
${hasGitIgnore ? green('✅ .gitignore: detected') : yellow('❌ .gitignore: missing')}${gitignoreNote}
${hasKnowledgeMd ? green('✅ knowledge.md: detected') : yellow('❌ knowledge.md: missing')}
${hasCodebuffJson ? green('✅ codebuff.json: detected') : yellow('❌ codebuff.json: missing')}`
      }

      // Condition 3: Missing .gitignore
      if (!hasGitIgnore) {
        return `${currentDirectoryLine}\n${green('✅ Git repo: detected')}
${yellow('❌ .gitignore: missing - type "generate a reasonable .gitignore"')}${gitignoreNote}
${hasKnowledgeMd ? green('✅ knowledge.md: detected') : yellow('❌ knowledge.md: missing')}
${hasCodebuffJson ? green('✅ codebuff.json: detected') : yellow('❌ codebuff.json: missing')}`
      }
      // Condition 4: Missing knowledge files
      return `${currentDirectoryLine}\n${green('✅ Git repo: detected')}
${green('✅ .gitignore: detected')}${gitignoreNote}
${
  !hasKnowledgeMd && !hasCodebuffJson
    ? yellow('❌ knowledge.md & codebuff.json: missing - type "init"')
    : !hasKnowledgeMd
      ? yellow('❌ knowledge.md: missing - type "init"')
      : !hasCodebuffJson
        ? yellow('❌ codebuff.json: missing - type "init"')
        : green('✅ knowledge.md & codebuff.json: detected')
}
${hasKnowledgeMd && !hasCodebuffJson ? `\n${yellow('codebuff.json runs deployment scripts for you to test your code and runs configured checks for you by running your dev server.')}` : ''}
${!hasKnowledgeMd && hasCodebuffJson ? `\n${yellow('knowledge.md helps Codebuff understand your project structure and codebase better for better results.')}` : ''}
${!hasKnowledgeMd && !hasCodebuffJson ? `\n${yellow('knowledge.md helps Codebuff understand your project structure and codebase better for better results.')}\n${yellow('codebuff.json runs deployment scripts for you to test your code and runs configured checks for you by running your dev server.')}` : ''}`
    })()
  )

  // COMMUNITY & FEEDBACK SECTION
  console.log(`\n${bold(underline('COMMUNITY & FEEDBACK'))}`)
  console.log(
    `Thanks for using Codebuff! DM @brandonkachen or @jahooma on Discord, or email ${blueBright('founders@codebuff.com')}`
  )
  console.log(
    `Join our Discord: ${blueBright('https://codebuff.com/discord')} ${yellow('(Ctrl/Cmd+Click to open)')}`
  )

  console.log(`\n${bold(underline('EXAMPLE PROMPTS'))}
${'Code Quality:'}
${cyan('  • "Add error handling to this function"')}
${cyan('  • "Add JSDoc comments to this file"')}
${cyan('  • "Fix the type errors in this component"')}

${'Testing & Validation:'}
${cyan('  • "Create a unit test for the auth module"')}
${cyan('  • "Add input validation to this endpoint"')}

${'Performance & Architecture:'}
${cyan('  • "Optimize this database query"')}
${cyan('  • "Refactor this to use async/await"')}
${cyan('  • "Add caching to this service"')}

${'Features & Infrastructure:'}
${cyan('  • "Create a new API endpoint for users"')}
${cyan('  • "Add logging to these functions"')}
${cyan('  • "Set up CI/CD pipeline config"')}
`)

  // INTERACTIVE COMMANDS SECTION
  const fixedCommandWidth = 30 // Fixed width for command column

  const formatMenuLine = (commandText: string, description: string) => {
    const paddedCommand = commandText.padEnd(fixedCommandWidth)
    return `${paddedCommand}${description}`
  }

  const menuLines = interactiveCommandDetails
    .filter((cmd) => cmd.commandText) // Filter out slash-only commands like the discrete undo/redo
    .map((cmd) => formatMenuLine(cmd.commandText, cmd.description))

  console.log(
    `\n${bold(underline('COMMANDS (type these below)'))}${' '.repeat(fixedCommandWidth - 27)}${bold(underline('DESCRIPTION'))}\n\n${menuLines.join(`\n${dividerLine}`)}\n`
  )

  console.log(`\n↓ Enter your prompt or command below ↓`)
}
