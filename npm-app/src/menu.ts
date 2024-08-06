import { getProjectRoot } from './project-files'
import chalk from 'chalk'

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
        return (chalk as any)[color](char)
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
    chalk.bold.blue('Welcome to Manicode - Your AI-powered coding assistant!\n')
  )
  console.log(
    `Manicode will read and write files within your current directory (${getProjectRoot()}), run commands in your terminal, and scrape the web to accomplish tasks you give it.\n`
  )
  console.log(
    'Ask Manicode to implement small features, refactor code, write unit tests, write scripts, or give advice.\n'
  )
  console.log('Press CTRL-C to exit app\n')
  console.log('TIPS')
  console.log(
    '() Create a knowledge.md file and collect specific points of advice. The assistant will use this knowledge to improve its responses.'
  )
  console.log(
    '() Press the CTRL-U to undo file changes from the conversation. Press CTRL-R to redo.'
  )
  console.log(
    '() Press ESC or CTRL-C while Manicode is generating a response to cut it off.'
  )
  console.log(
    '() Email your feedback to james@manifold.markets. Thanks for using Manicode!'
  )
}
