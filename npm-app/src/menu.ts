import { getProjectRoot } from './project-files'
import chalk from 'chalk'

const getRandomColor = () => {
  const colors = ['green', 'blue', 'cyan']
  return colors[Math.floor(Math.random() * colors.length)]
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

export function displayMenu() {
  process.stdout.clearLine(0)
  console.log()

  console.log(`
${colorizeRandom('██╗  ██╗')}${colorizeRandom('████╗')}${colorizeRandom('██╗   █╗')}${colorizeRandom('█╗')}${colorizeRandom('  ████╗ ')}${colorizeRandom(' ███╗ ')}${colorizeRandom('████╗ ')}${colorizeRandom('█████╗')}
${colorizeRandom('███╗███║')}${colorizeRandom('█╔══█╗')}${colorizeRandom('███╗  █║')}${colorizeRandom('█║')}${colorizeRandom(' █╔═══╝')}${colorizeRandom('█╔══█╗')}${colorizeRandom('█╔══█╗')}${colorizeRandom('█╔═══╝')}
${colorizeRandom('█╔███╔█║')}${colorizeRandom('█████║')}${colorizeRandom('█╔██╗ █║')}${colorizeRandom('█║')}${colorizeRandom(' █║    ')}${colorizeRandom('█║  █║')}${colorizeRandom('█║  █║')}${colorizeRandom('████╗ ')}
${colorizeRandom('█║╚█╔╝█║')}${colorizeRandom('█╔══█║')}${colorizeRandom('█║╚██╗█║')}${colorizeRandom('█║')}${colorizeRandom(' █║    ')}${colorizeRandom('█║  █║')}${colorizeRandom('█║  █║')}${colorizeRandom('█╔══╝ ')}
${colorizeRandom('█║ ╚╝ █║')}${colorizeRandom('█║  █║')}${colorizeRandom('█║ ╚███║')}${colorizeRandom('█║')}${colorizeRandom(' ╚████╗')}${colorizeRandom(' ███╔╝')}${colorizeRandom('████╔╝')}${colorizeRandom('█████╗')}
${colorizeRandom('╚╝    ╚╝')}${colorizeRandom('╚╝  ╚╝')}${colorizeRandom('╚╝  ╚══╝')}${colorizeRandom('═╝')}${colorizeRandom('  ════╝')}${colorizeRandom(' ═══╝ ')}${colorizeRandom('╚═══╝ ')}${colorizeRandom('╚════╝')}
`)
  console.log(
    chalk.bold.blue('Welcome to Manicode - Your AI-powered coding assistant!\n')
  )
  console.log(
    `Manicode will read and write files within your current directory (${getProjectRoot()}), run commands in your terminal, and scrape the web to accomplish tasks you give it.\n`
  )
  console.log(
    'Ask it to implement small features, write unit tests, write scripts, or give advice.\n'
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
