import * as fs from 'fs'
import os from 'os'
import path from 'path'

import { CostMode } from 'common/constants'
import { blueBright, bold, green, magenta, underline, yellow } from 'picocolors'

import { getProjectRoot } from './project-files'

const getRandomColors = () => {
  const allColors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']
  const colors: string[] = []
  while (colors.length < 3) {
    const color = allColors[Math.floor(Math.random() * allColors.length)]
    if (!colors.includes(color)) {
      colors.push(color)
    }
  }
  return colors
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
  const selectedColors = getRandomColors()
  const terminalWidth = process.stdout.columns || 80
  const dividerLine = '─'.repeat(terminalWidth)

  const getRandomColor = () => {
    return selectedColors[Math.floor(Math.random() * selectedColors.length)]
  }

  const colorizeRandom = (text: string) => {
    return text
      .split('')
      .map((char) => {
        const color = getRandomColor()
        return color[char as keyof typeof color]
      })
      .join('')
  }

  process.stdout.clearLine(0)
  console.log()

  console.log(`
${colorizeRandom('          ')}
${colorizeRandom('██████╗')}${colorizeRandom(' ██████╗  ')}${colorizeRandom('██████╗ ')}${colorizeRandom('███████╗')}${colorizeRandom('██████╗ ')}${colorizeRandom('██╗   ██╗')}${colorizeRandom('███████╗')}${colorizeRandom('███████╗')}
${colorizeRandom('██╔════╝')}${colorizeRandom('██╔═══██╗')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██╔════╝')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██║   ██║')}${colorizeRandom('██╔════╝')}${colorizeRandom('██╔════╝')}
${colorizeRandom('██║     ')}${colorizeRandom('██║   ██║')}${colorizeRandom('██║  ██║')}${colorizeRandom('█████╗  ')}${colorizeRandom('██████╔╝')}${colorizeRandom('██║   ██║')}${colorizeRandom('█████╗  ')}${colorizeRandom('█████╗  ')}
${colorizeRandom('██║     ')}${colorizeRandom('██║   ██║')}${colorizeRandom('██║  ██║')}${colorizeRandom('██╔══╝  ')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██║   ██║')}${colorizeRandom('██╔══╝  ')}${colorizeRandom('██╔══╝  ')}
${colorizeRandom('╚██████╗')}${colorizeRandom('╚██████╔╝')}${colorizeRandom('██████╔╝')}${colorizeRandom('███████╗')}${colorizeRandom('██████╔╝')}${colorizeRandom('╚██████╔╝')}${colorizeRandom('██║     ')}${colorizeRandom('██║     ')}
${colorizeRandom(' ╚═════╝')}${colorizeRandom(' ╚═════╝ ')}${colorizeRandom(' ╚═════╝ ')}${colorizeRandom('╚══════╝')}${colorizeRandom('╚═════╝ ')}${colorizeRandom(' ╚═════╝ ')}${colorizeRandom('╚═╝     ')}${colorizeRandom('╚═╝     ')}
`)
  console.log(
    `${bold(blueBright('📂'))} ${bold('Current directory:')} ${bold(blueBright(getProjectRoot()))}`
  )
  console.log(`
${bold(underline('DIAGNOSTICS CHECK'))}`)

  console.log(
    (() => {
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

      // Condition 1: Git repo found, all files present
      if (hasGitRepo && hasGitIgnore && hasKnowledgeMd && hasCodebuffJson) {
        return `${green('✅ Git repo: detected')}
${green('✅ .gitignore: detected')}
${green('✅ knowledge.md: detected')}
${green('✅ codebuff.json: detected')}`
      }

      // Condition 2: Git repo not found
      if (!hasGitRepo) {
        return `${yellow('❌ Git repo: not found - navigate to a working directory!')}
${hasGitIgnore ? green('✅ .gitignore: detected') : yellow('❌ .gitignore: missing')}
${hasKnowledgeMd ? green('✅ knowledge.md: detected') : yellow('❌ knowledge.md: missing')}
${hasCodebuffJson ? green('✅ codebuff.json: detected') : yellow('❌ codebuff.json: missing')}`
      }

      // Condition 3: Missing .gitignore
      if (!hasGitIgnore) {
        return `${green('✅ Git repo: detected')}
${yellow('❌ .gitignore: missing - type "generate a reasonable .gitignore"')}
${hasKnowledgeMd ? green('✅ knowledge.md: detected') : yellow('❌ knowledge.md: missing')}
${hasCodebuffJson ? green('✅ codebuff.json: detected') : yellow('❌ codebuff.json: missing')}`
      }
      // Condition 4: Missing knowledge files
      return `${green('✅ Git repo: detected')}
${green('✅ .gitignore: detected')}
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

  console.log(`
${bold(underline('DIAGNOSTICS CHECK'))}`)

  // COMMUNITY & FEEDBACK SECTION
  console.log(`\n${bold(underline('COMMUNITY & FEEDBACK'))} `)

  console.log(`
DM @brandonkachen or @jahooma on Discord, or email ${blueBright('founders@codebuff.com')}

OUR DISCORD: ${blueBright('https://codebuff.com/discord')} ${yellow('(Ctrl/Cmd+Click to open)')}
`)

  // COMMANDS SECTION
  // Add bold and underlined header for commands section
  const fixedCommandWidth = 30 // Fixed width for command column
  console.log(
    `\n${bold(underline('COMMAND'))}${' '.repeat(fixedCommandWidth - 7)}${bold(underline('DESCRIPTION'))} `
  )

  const useSimpleLayout = terminalWidth < 100

  const formatMenuLine = (command: string, description: string) => {
    // Ensure command fits in the fixed width column
    const paddedCommand = command.padEnd(fixedCommandWidth)
    return `${paddedCommand}${description}`
  }

  if (useSimpleLayout) {
    // Clean, aligned format for commands in narrow terminals
    console.log(`
${formatMenuLine('"login"', 'Authenticate your session')}
${dividerLine}
${formatMenuLine('"diff" or "d"', 'Show last assistant change diff')}
${dividerLine}
${formatMenuLine('"undo" / "redo" or "u"', 'Revert or re-apply last change')}
${dividerLine}
${formatMenuLine('"checkpoint list"', 'List all checkpoints')}
${dividerLine}
${formatMenuLine('"checkpoint <id>"', 'Restore to a specific checkpoint')}
${dividerLine}
${formatMenuLine('"usage" / "credits"', 'View remaining / bonus AI credits')}
${dividerLine}
${formatMenuLine('"init"', 'Configure project for better results')}
${dividerLine}
${formatMenuLine('"exit" or Ctrl-C x2', 'Quit Codebuff')}
${dividerLine}
${formatMenuLine('"!<cmd>"', 'Run shell command directly')}
${dividerLine}
${formatMenuLine('"ESC key"', 'Cancel generation')}
  `)
  } else {
    // Original table format for larger terminals
    console.log(`
${formatMenuLine('"login"', 'Authenticate your session')}
${dividerLine}
${formatMenuLine('"diff" or "d"', 'Show last assistant change diff')}
${dividerLine}
${formatMenuLine('"undo" / "redo" or "u"', 'Revert or re-apply last change')}
${dividerLine}
${formatMenuLine('"checkpoint list"', 'List all checkpoints')}
${dividerLine}
${formatMenuLine('"checkpoint <id>"', 'Restore to a specific checkpoint')}
${dividerLine}
${formatMenuLine('"usage" / "credits"', 'View remaining / bonus AI credits')}
${dividerLine}
${formatMenuLine('"init"', 'Configure project for better results')}
${dividerLine}
${formatMenuLine('"exit" or Ctrl-C x2', 'Quit Codebuff')}
${dividerLine}
${formatMenuLine('"!<cmd>"', 'Run shell command directly')}
${dividerLine}
${formatMenuLine('"ESC key"', 'Cancel generation')}
`)
  }

  console.log(
    `\nThanks for using Codebuff - ${green('↓ Start prompting now ↓')}`
  )
}
