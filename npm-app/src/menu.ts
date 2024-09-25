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
  console.log('- Type "help" or "h" to print this menu\n')
  console.log('- Type "login" to log into Manicode\n')

  console.log('TIPS')
  console.log(
    '() Say: "Create knowledge files for my codebase" to generate and store information that will help Manicode understand your project.'
  )
  console.log(
    '() Add to knowledge files when Manicode makes mistakes. Usually there is context that Manicode is missing that led to the mistake, and adding this information will help Manicode improve its responses.'
  )
  console.log(
    '() Add "Don\'t change any files" to your prompt if you want it to think before making changes.'
  )
  console.log(
    '() Email your feedback to james@manifold.markets. Thanks for using Manicode!'
  )
}
