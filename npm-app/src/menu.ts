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
  console.log(
    bold(green('Welcome to Manicode - Your AI-powered coding assistant!\n'))
  )
  console.log(
    `Manicode will read and write files within your current directory (${getProjectRoot()}), run commands in your terminal, and scrape the web to accomplish tasks you give it.\n`
  )
  console.log(
    'Ask Manicode to implement small features, refactor code, write unit tests, write scripts, or give advice.\n'
  )

  console.log('COMMANDS')
  console.log('- Press CTRL-C to exit app')
  console.log('- Press ESC to cancel generation')
  console.log('- Type "undo" or "u" to undo the last change')
  console.log('- Type "redo" or "r" to redo the last change')
  console.log('- Type "/run <command>" to run a terminal command. Short commands will work without the "/run" prefix')
  console.log('- Type "login" to log into Manicode')
  console.log('- Type "help" or "h" to print this menu\n')

  console.log('TIPS')
  console.log(
    '- Ask Manicode to fix the errors from running your tests or compiling your project.'
  )
  console.log(
    '- Ask Manicode to refactor a large file into smaller files.'
  )
  console.log(
    '- Ask Manicode any questions you have about the codebase.'
  )
  console.log(
    '- Tell Manicode what it did wrong, and it will learn by saving a note in a "knowledge" file.'
  )
  console.log(
    '- Say: "Create knowledge files for my codebase" to generate and store information that will help Manicode understand your project.'
  )
  console.log(
    '- When implementing a new feature, create a new file with a description of what you want to build and ask Manicode to read that file and implement it.'
  )
  console.log(
    '- Email your feedback to james@manicode.ai. Thanks for using Manicode!'
  )
}
