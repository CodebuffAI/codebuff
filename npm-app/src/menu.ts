import * as fs from 'fs'
import os from 'os'
import path from 'path'

import { CostMode } from 'common/constants'
import {
  blue,
  blueBright,
  bold,
  cyan,
  gray,
  green,
  magenta,
  red,
  underline,
  yellow,
} from 'picocolors'

import { Formatter } from 'picocolors/types'
import { getProjectRoot, isSubdir } from './project-files'

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
    isSlashCommand: false,
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
    commandText: '"clear"',
    baseCommand: 'clear',
    description: 'Clear the conversation context',
    isSlashCommand: true,
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
  return interactiveCommandDetails
    .filter((cmd) => cmd.isSlashCommand && cmd.baseCommand)
    .sort((a, b) => a.baseCommand!.localeCompare(b.baseCommand!))
}

export function displaySlashCommandHelperMenu() {
  const commands = getSlashCommands()
  if (commands.length === 0) {
    return
  }

  // Calculate the maximum length of command strings for alignment
  const maxCommandLength = Math.max(
    ...commands.map((cmd) => {
      const commandString = `/${cmd.baseCommand}${cmd.params ? ` ${cmd.params}` : ''}`
      return commandString.length
    })
  )

  // Format each command with its description
  const commandLines = commands.map((cmd) => {
    const commandString = `/${cmd.baseCommand}${cmd.params ? ` ${cmd.params}` : ''}`
    // Pad with dots to align descriptions
    const padding = '.'.repeat(maxCommandLength - commandString.length + 3)
    return `${cyan(commandString)} ${padding} ${cmd.description}`
  })

  // Add the shell command tip at the end
  const shellTip = gray(
    '(Tip: Type "!" followed by a command to run it in your shell, e.g., !ls)'
  )

  // Print with consistent spacing
  console.log(`\n\n${commandLines.join('\n')}\n${shellTip}\n`)
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

  if (isSubdir(getProjectRoot(), os.homedir())) {
    console.info(
      `Welcome! Codebuff is your AI pair programmer that edits your codebase through natural conversation.

You are currently in "${green(getProjectRoot())}".

To get started:
1. Navigate to your project (cd your/project/root)
2. Run "codebuff" there instead
`.trim()
    )
    process.exit(0)
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

const getRandomColors = () => {
  const allColors = [red, green, yellow, blue, blueBright, magenta, cyan]
  const colors: Formatter[] = []
  while (colors.length < 3) {
    const color = allColors[Math.floor(Math.random() * allColors.length)]
    if (!colors.includes(color)) {
      colors.push(color)
    }
  }
  return colors
}

export function displayMenu() {
  const terminalWidth = process.stdout.columns || 80
  const dividerLine = '─'.repeat(terminalWidth)

  const selectedColors = getRandomColors()
  const colorizeRandom = (text: string) => {
    return text
      .split('')
      .map((char) => {
        const colorFn =
          selectedColors[Math.floor(Math.random() * selectedColors.length)]
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
        return `${currentDirectoryLine}\n${yellow('❌ Git repo: not found')}${' - navigate to a working directory!'}
${hasGitIgnore ? green('✅ .gitignore: detected') : yellow('❌ .gitignore: missing')}${gitignoreNote}
${hasKnowledgeMd ? green('✅ knowledge.md: detected') : yellow('❌ knowledge.md: missing')}${' — run "init" to fix'}
${hasCodebuffJson ? green('✅ codebuff.json: detected') : yellow('❌ codebuff.json: missing')}${' — run "init" to fix'}`
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
    `Join our Discord: ${blueBright('https://codebuff.com/discord')} ${gray(`(${os.platform() === 'darwin' ? 'Command' : 'Ctrl'} + Click to open)`)}`
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
