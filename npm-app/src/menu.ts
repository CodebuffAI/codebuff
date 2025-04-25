import * as fs from 'fs'
import os from 'os'
import path from 'path'

import { CostMode, CREDITS_REFERRAL_BONUS } from 'common/constants'
import picocolors, {
  blue,
  blueBright,
  bold,
  green,
  magenta,
  yellow,
} from 'picocolors'

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
  console.log(`${costModeDescription[costMode]}`)
  console.log(
    `codebuff will read and write files in "${getProjectRoot()}". Type "help" for a list of commands.`
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
        "Just fyi, this project doesn't contain a .git directory (are you at the top level of your project?). codebuff works best with a git repo!"
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
    `\ncodebuff will read and write files within your current directory (${getProjectRoot()}) and run commands in your terminal.`
  )

  console.log('\nASK CODEBUFF TO...')
  console.log('- Build a feature. Brain dump what you want first.')
  console.log('- Write unit tests')
  console.log('- Refactor a component into multiple components')
  console.log('- Fix errors from compiling your project or running tests')
  console.log('- Write a script.')
  console.log(
    '- Plan a feature before implementing it. Or, write your own plan in a file and ask codebuff to implement it step-by-step'
  )
  console.log(
    '- Build an integration after pasting in the URL to relevant documentation'
  )
  console.log(
    '- "Create knowledge files for your codebase" to help codebuff understand your project'
  )

  console.log('\nCommands:')
  console.log('- Enter terminal commands directly: "cd backend", "npm test"')
  console.log(
    '- Use "!command" to explicitly run a terminal command (e.g. "!ls -la")'
  )
  console.log('- Press ESC to cancel generation')
  console.log(
    '- Type "init" to have codebuff automatically configure your project for a smoother experience'
  )
  console.log(
    '- Type "undo" or "redo" (abbreviated "u" or "r") to undo or redo the last change'
  )
  console.log('- Type "login" to log into codebuff')
  console.log('- Type "exit" or press Ctrl+C twice to exit codebuff')
  console.log(
    '- Type "diff" or "d" to show changes from the last assistant response'
  )
  console.log(
    '- Start codebuff with --lite for efficient responses, --max for higher quality responses, or --experimental for cutting-edge features'
  )

  console.log('\nCheckpoint Commands:')
  console.log('- Type "checkpoint <id>" to restore a specific checkpoint')
  console.log(
    '- Type "checkpoint list" or "checkpoints" to list all available checkpoints'
  )

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
    "\nAny files in .gitignore are not read by codebuff. You can ignore further files with .codebuffignore, or choose files codebuff should not ignore by adding a '!' prefix to the ignore pattern."
  )
  console.log(
    '\nEmail your feedback to',
    bold(blue('founders@codebuff.com.')),
    'Thanks for using codebuff!'
  )
}
