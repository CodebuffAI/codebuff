#!/usr/bin/env node

import { green } from 'picocolors'
import { detectInstaller, runUpdateCodebuff } from './update-manicode'

async function codebuff(
  projectDir: string | undefined,
  { initialInput, autoGit }: { initialInput?: string; autoGit: boolean }
) {
  console.log(
    green(
      `Thanks for using Manicode! We've been renamed to Codebuff. Unfortunately, you will need to use the \`codebuff\` npm package from now on.`
    )
  )
  const installer = detectInstaller()
  if (installer) {
    runUpdateCodebuff(installer)
  } else {
    console.log('Please install codebuff with `npm i -g codebuff`')
  }
  console.log(green(`Run \`codebuff\` to continue.`))

  process.exit(0)
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const help = args.includes('--help') || args.includes('-h')
  const autoGit = args.includes('--auto-git')
  if (autoGit) {
    args.splice(args.indexOf('--auto-git'), 1)
  }

  const projectPath = args[0]
  const initialInput = args.slice(1).join(' ')

  if (help) {
    console.log('Usage: codebuff [project-directory] [initial-prompt]')
    console.log('Both arguments are optional.')
    console.log(
      'If no project directory is specified, Codebuff will use the current directory.'
    )
    console.log(
      'If an initial prompt is provided, it will be sent as the first user input.'
    )
    console.log()
    console.log(
      'Codebuff allows you to interact with your codebase using natural language.'
    )
    process.exit(0)
  }

  codebuff(projectPath, { initialInput, autoGit })
}
