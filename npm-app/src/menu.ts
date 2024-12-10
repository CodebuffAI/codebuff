import { getProjectRoot } from './project-files.js'
import picocolors, { blue } from 'picocolors'
import { bold, green } from 'picocolors'
import React from 'react'
import { render } from 'ink'
import { SelectMenu } from './components/terminal-ui/SelectMenu.js'

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

function displayAsciiArt() {
  const selectedColors = getRandomColors()
  const getRandomColor = () => selectedColors[Math.floor(Math.random() * selectedColors.length)]
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
}

async function handleMenuSelection(index: number) {
  const menuItems = [
    '=== ACTIONS ===',
    'Build a feature',
    'Write unit tests',
    'Refactor a component',
    'Fix errors',
    'Write a script',
    'Plan a feature',
    'Build an integration',
    'Create knowledge files',
    '',
    '=== COMMANDS ===',
    'Run terminal command',
    'Cancel generation (ESC)',
    'Undo/Redo (u/r)',
    'Login',
    'Exit',
    'Show diff (d)',
    '',
    '=== INFO ===',
    'Redeem referral code',
    'View referral bonus',
    'View ignored files',
    'Send feedback'
  ]

  const item = menuItems[index]

  if (item.startsWith('===') || item === '') {
    return
  }

  switch (item) {
    case 'Exit':
      process.exit(0)
      break
    case 'Login':
      console.log('Type "login" to log into Codebuff')
      break
    case 'Build a feature':
      console.log('Start by describing the feature you want to build')
      break
    case 'Write unit tests':
      console.log('Describe the component or functionality you want to test')
      break
    case 'Refactor a component':
      console.log('Specify which component needs refactoring')
      break
    case 'Fix errors':
      console.log('Share the errors you are encountering')
      break
    case 'Write a script':
      console.log('Describe what the script should do')
      break
    case 'Plan a feature':
      console.log('Describe the feature you want to plan')
      break
    case 'Build an integration':
      console.log('Share the documentation URL for the integration')
      break
    case 'Create knowledge files':
      console.log('Creating knowledge files to help understand your project')
      break
    case 'Run terminal command':
      console.log('Enter terminal commands directly or use "/run <command>"')
      break
    case 'Cancel generation (ESC)':
      console.log('Press ESC to cancel generation')
      break
    case 'Undo/Redo (u/r)':
      console.log('Type "undo" or "u" to undo, "redo" or "r" to redo')
      break
    case 'Show diff (d)':
      console.log('Type "diff" or "d" to show changes')
      break
    case 'Redeem referral code':
      console.log('Simply paste your referral code here')
      break
    case 'View referral bonus':
      console.log('Refer new users and each of you will earn 500 credits per month')
      break
    case 'View ignored files':
      console.log('Files in .gitignore and .codebuffignore are not read by Codebuff')
      break
    case 'Send feedback':
      console.log('Email your feedback to founders@codebuff.com')
      break
    default:
      console.log(`Selected: ${item}`)
  }
}

export async function displayMenu() {
  const { SelectMenu } = await import('./components/terminal-ui/SelectMenu.js')

  displayAsciiArt()

  const menuItems = [
    '=== ACTIONS ===',
    'Build a feature',
    'Write unit tests',
    'Refactor a component',
    'Fix errors',
    'Write a script',
    'Plan a feature',
    'Build an integration',
    'Create knowledge files',
    '',
    '=== COMMANDS ===',
    'Run terminal command',
    'Cancel generation (ESC)',
    'Undo/Redo (u/r)',
    'Login',
    'Exit',
    'Show diff (d)',
    '',
    '=== INFO ===',
    'Redeem referral code',
    'View referral bonus',
    'View ignored files',
    'Send feedback'
  ]

  render(
    React.createElement(SelectMenu, {
      items: menuItems,
      onSelect: handleMenuSelection
    })
  )

  console.log(
    '\nAny files in .gitignore are not read by Codebuff. You can ignore further files with .codebuffignore'
  )
  console.log(
    '\nEmail your feedback to',
    bold(blue('founders@codebuff.com.')),
    'Thanks for using Codebuff!'
  )

  console.log(
    '-',
    bold(
      green(
        `Refer new users and each of you will earn 500 credits per month: ${process.env.NEXT_PUBLIC_APP_URL}/referrals`
      )
    )
  )
}
