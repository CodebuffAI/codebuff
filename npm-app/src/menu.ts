import { getProjectRoot } from './project-files'
import picocolors from 'picocolors'
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
${colorizeRandom('    /\\    /\\    { AI }')}
${colorizeRandom('   /  \\  /  \\   [CODE]')}
${colorizeRandom('  /    \\/    \\')}
${colorizeRandom('███╗   ███╗')}${colorizeRandom('█████╗ ')}${colorizeRandom('███╗   ██╗')}${colorizeRandom('██╗')}${colorizeRandom('  ██████╗ ')}${colorizeRandom(' █████╗ ')}${colorizeRandom('██████╗ ')}${colorizeRandom('███████╗')}
${colorizeRandom('████╗ ████║')}${colorizeRandom('██╔══██╗')}${colorizeRandom('████╗  ██║')}${colorizeRandom('██║')}${colorizeRandom(' ██╔════╝')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██╔══██╗')}${colorizeRandom('██╔════╝')}
${colorizeRandom('██╔████╔██║')}${colorizeRandom('███████║')}${colorizeRandom('██╔██╗ ██║')}${colorizeRandom('██║')}${colorizeRandom(' ██║     ')}${colorizeRandom('██║  ██║')}${colorizeRandom('██║  ██║')}${colorizeRandom('█████╗  ')}
${colorizeRandom('██║╚██╔╝██║')}${colorizeRandom('██╔══██║')}${colorizeRandom('██║╚██╗██║')}${colorizeRandom('██║')}${colorizeRandom(' ██║     ')}${colorizeRandom('██║  ██║')}${colorizeRandom('██║  ██║')}${colorizeRandom('██╔══╝  ')}
${colorizeRandom('██║ ╚═╝ ██║')}${colorizeRandom('██║  ██║')}${colorizeRandom('██║ ╚████║')}${colorizeRandom('██║')}${colorizeRandom(' ╚██████╗')}${colorizeRandom(' █████╔╝')}${colorizeRandom('██████╔╝')}${colorizeRandom('███████╗')}
${colorizeRandom('╚═╝     ╚═╝')}${colorizeRandom('╚═╝  ╚═╝')}${colorizeRandom('╚═╝  ╚═══╝')}${colorizeRandom('╚═╝')}${colorizeRandom('  ╚═════╝')}${colorizeRandom(' ╚════╝ ')}${colorizeRandom('╚═════╝ ')}${colorizeRandom('╚══════╝')}
`)
  console.log(bold(green("Welcome! I'm your AI coding assistant.")))
  console.log(
    `\nManicode will read and write files within your current directory (${getProjectRoot()}) and run commands in your terminal.`
  )

  console.log('\nASK MANICODE TO...')
  console.log('- Refactor a large file into smaller files')
  console.log('- Write unit tests')
  console.log('- Fix errors from running tests or compiling your project')
  console.log('- Write a script')
  console.log(
    '- Plan a feature before implementing it. Or, write your own plan in a file and ask Manicode to implement it step-by-step'
  )
  console.log(
    '- Do something after pasting in the URL to relevant documentation'
  )
  console.log(
    '- "Create knowledge files for your codebase" to help Manicode understand your project'
  )

  console.log('\nCOMMANDS')
  console.log('- Enter terminal commands directly: "cd backend", "npm test"')
  console.log('- Use "/run <command>" for long terminal commands')
  console.log('- Press ESC to cancel generation')
  console.log(
    '- Type "undo" or "redo" (abbreviated "u" or "r") to undo or redo the last change'
  )
  console.log('- Type "login" to log into Manicode')

  console.log(
    '\nAny files in .gitignore are not read by Manicode. You can ignore further files with .manicodeignore'
  )
  console.log(
    '\nEmail your feedback to james@manicode.ai. Thanks for using Manicode!'
  )
}
