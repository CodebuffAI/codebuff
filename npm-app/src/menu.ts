import path from 'path'
import * as fs from 'fs'

import picocolors, { blue, blueBright, bold, green, magenta, underline, yellow } from 'picocolors'

import { CostMode, CREDITS_REFERRAL_BONUS } from 'common/constants'
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
  }
  console.log(`${costModeDescription[costMode]}`)
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
  const selectedColors = getRandomColors()

  const getRandomColor = () => {
    return selectedColors[Math.floor(Math.random() * selectedColors.length)]
  }

  const colorizeRandom = (text: string) => {
    return text
      .split('')
      .map((char) => {
        const color = getRandomColor()
        return (picocolors as any)[color](char)
      })
      .join('')
  }

  process.stdout.clearLine(0)
  console.log()

  console.log(`
${colorizeRandom('     { AI }')}
${colorizeRandom('    [CODER]')}
${colorizeRandom('          ')}
${colorizeRandom('██████╗')}${colorizeRandom(' ██████╗  ')}${colorizeRandom('██████╗ ')}${colorizeRandom('███████╗')}${colorizeRandom('██████╗ ')}${colorizeRandom('██╗   ██╗')}${colorizeRandom('███████╗')}${colorizeRandom('███████╗')}
${colorizeRandom('██╔════╝')}${colorizeRandom('██╔═══██╗')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██╔════╝')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██║   ██║')}${colorizeRandom('██╔════╝')}${colorizeRandom('██╔════╝')}
${colorizeRandom('██║     ')}${colorizeRandom('██║   ██║')}${colorizeRandom('██║  ██║')}${colorizeRandom('█████╗  ')}${colorizeRandom('██████╔╝')}${colorizeRandom('██║   ██║')}${colorizeRandom('█████╗  ')}${colorizeRandom('█████╗  ')}
${colorizeRandom('██║     ')}${colorizeRandom('██║   ██║')}${colorizeRandom('██║  ██║')}${colorizeRandom('██╔══╝  ')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██║   ██║')}${colorizeRandom('██╔══╝  ')}${colorizeRandom('██╔══╝  ')}
${colorizeRandom('╚██████╗')}${colorizeRandom('╚██████╔╝')}${colorizeRandom('██████╔╝')}${colorizeRandom('███████╗')}${colorizeRandom('██████╔╝')}${colorizeRandom('╚██████╔╝')}${colorizeRandom('██║     ')}${colorizeRandom('██║     ')}
${colorizeRandom(' ╚═════╝')}${colorizeRandom(' ╚═════╝ ')}${colorizeRandom('╚═════╝ ')}${colorizeRandom('╚══════╝')}${colorizeRandom('╚═════╝ ')}${colorizeRandom(' ╚═════╝ ')}${colorizeRandom('╚═╝     ')}${colorizeRandom('╚═╝     ')}
`)
  console.log(bold(green("Welcome! I'm your AI coding assistant.")))
  console.log(
    `\nCodebuff will read and write files within your current directory (${getProjectRoot()}) and run commands in your terminal.`
  )

  console.log('\nASK CODEBUFF TO...')
  console.log('- Build a feature. Brain dump what you want first.')
  console.log('- Write unit tests')
  console.log('- Refactor a component into multiple components')
  console.log('- Fix errors from compiling your project or running tests')
  console.log('- Write a script.')
  console.log(
    '- Plan a feature before implementing it. Or, write your own plan in a file and ask Codebuff to implement it step-by-step'
  )
  console.log(
    '- Build an integration after pasting in the URL to relevant documentation'
  )
  console.log(
    '- "Create knowledge files for your codebase" to help Codebuff understand your project'
  )

  console.log('\nCommands:')
  console.log('- Enter terminal commands directly: "cd backend", "npm test"')
  console.log('- Use "!command" to run terminal commands (e.g. "!ls -la")')
  console.log('- Press ESC to cancel generation')
  console.log(
    '- Type "undo" or "redo" (abbreviated "u" or "r") to undo or redo the last change'
  )
  console.log('- Type "login" to log into Codebuff')
  console.log('- Type "exit" or press Ctrl+C twice to exit Codebuff')
  console.log(
    '- Type "diff" or "d" to show changes from the last assistant response'
  )
  console.log(
    '- Start codebuff with --lite for efficient, budget responses or --max for higher quality responses'
  )

  console.log('\nCheckpoint Commands:')
  console.log('- Type "checkpoint list" or "checkpoints" to list all available checkpoints')
  console.log('- Type "checkpoint <id>" to show details about a specific checkpoint')
  console.log('- Type "restore <id>" to restore to a specific checkpoint')
  console.log('- Type "checkpoint clear" to clear all checkpoints')

  console.log(`\n- Redeem a referral code by simply pasting it here.`)
  console.log(
    '-',
    bold(
      green(
        `Refer new users and each of you will earn ${CREDITS_REFERRAL_BONUS} credits per month: ${process.env.NEXT_PUBLIC_APP_URL}/referrals`
      )
    )
  )

  console.log(
    '\nAny files in .gitignore are not read by Codebuff. You can ignore further files with .codebuffignore'
  )
  console.log(
    '\nEmail your feedback to',
    bold(blue('founders@codebuff.com.')),
    'Thanks for using Codebuff!'
  )
}
