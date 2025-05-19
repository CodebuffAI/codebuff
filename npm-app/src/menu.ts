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
  console.log(
    `Codebuff will read and write files in "${getProjectRoot()}". Type "help" for a list of commands.`
  )

  const gitDir = path.join(getProjectRoot(), '.git')
  if (getProjectRoot() === os.homedir()) {
    console.info(
      '\nTo get started:\n- cd into a project\n- ask for a code change'
    )
    return
  }

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

  console.log(`\n${bold('Your AI pair programmer that understands, edits, and improves your codebase through natural conversation.')}`)

  console.log(`\n${bold(underline('DIAGNOSTICS CHECK'))}`)

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
    `DM @brandonkachen or @jahooma on Discord, or email ${blueBright('founders@codebuff.com')}`
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

  const formatMenuLine = (command: string, description: string) => {
    const paddedCommand = command.padEnd(fixedCommandWidth)
    return `${paddedCommand}${description}`
  }

  const menuLines = [
    formatMenuLine('type "login"', 'Authenticate your session'),
    formatMenuLine('type "init"', 'Configure project for better results'),
    formatMenuLine('type "diff" or "d"', 'Show last assistant change diff'),
    formatMenuLine('type "undo" / "redo"', 'Revert or re-apply last change'),
    formatMenuLine(
      'type "checkpoint <id>"',
      'Restore to a specific checkpoint'
    ),
    formatMenuLine('type "!<cmd>"', 'Run shell command directly'),
    formatMenuLine(
      'type "usage" / "credits"',
      'View remaining / bonus AI credits'
    ),
    formatMenuLine('hit ESC key or Ctrl-C', 'Cancel generation'),
    formatMenuLine('type "exit" or Ctrl-C x2', 'Quit Codebuff'),
  ]

  console.log(
    `\n${bold(underline('INTERACTIVE COMMANDS'))}${' '.repeat(fixedCommandWidth - 20)}${bold(underline('DESCRIPTION'))}\n${menuLines.join(`\n${dividerLine}`)}\n`
  )

  console.log(`\nThanks for using Codebuff!`)
  console.log(`${green('↓ Start prompting now ↓')}`)
}
