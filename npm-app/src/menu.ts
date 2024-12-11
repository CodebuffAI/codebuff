import { CREDITS_REFERRAL_BONUS } from 'common/constants'
import { getProjectRoot } from './project-files'
import picocolors, { blue } from 'picocolors'
import { bold, green } from 'picocolors'

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

  console.log('\nCOMMANDS')
  console.log('- Enter terminal commands directly: "cd backend", "npm test"')
  console.log('- Use "/run <command>" for long terminal commands')
  console.log('- Press ESC to cancel generation')
  console.log(
    '- Type "undo" or "redo" (abbreviated "u" or "r") to undo or redo the last change'
  )
  console.log('- Type "login" to log into Codebuff')
  console.log('- Type "exit" or press Ctrl+C twice to exit Codebuff')
  console.log(
    '- Type "diff" or "d" to show changes from the last assistant response'
  )
  console.log(`- Redeem a referral code by simply pasting it here.`)
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
