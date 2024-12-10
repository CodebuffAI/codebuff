#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { yellow } from 'picocolors'

import { CLI } from './cli.js'
import {
  initProjectFileContextWithWorker,
  setProjectRoot,
} from './project-files.js'
import { updateCodebuff } from './update-codebuff.js'

async function codebuff(
  projectDir: string | undefined,
  { initialInput, autoGit }: { initialInput?: string; autoGit: boolean }
) {
  const dir = setProjectRoot(projectDir)

  const updatePromise = updateCodebuff()
  const initFileContextPromise = initProjectFileContextWithWorker(dir)

  const readyPromise = Promise.all([updatePromise, initFileContextPromise])

  const cli = new CLI(readyPromise, { autoGit })

  console.log(
    `Codebuff will read and write files in "${dir}". Type "help" for a list of commands.`
  )

  const gitDir = path.join(dir, '.git')
  if (!fs.existsSync(gitDir)) {
    console.warn(
      yellow(
        'Warning: No .git directory found. Make sure you are at the top level of your project.'
      )
    )
  }

  cli.printInitialPrompt(initialInput)
}

if (require.main === module) {
  async function main() {
    const args = process.argv.slice(2)
    const help = args.includes('--help') || args.includes('-h')
    const autoGit = args.includes('--auto-git')
    if (autoGit) {
      args.splice(args.indexOf('--auto-git'), 1)
    }

    async function handleDemo() {
      const demoIndex = args.indexOf('--demo')
      if (demoIndex !== -1) {
        args.splice(demoIndex, 1)
        const demoComponent = args[demoIndex] || ''
        args.splice(demoIndex, 1)
        const cli = new CLI(Promise.resolve([undefined, undefined]), { autoGit })
        await cli.handleDemoComponents([demoComponent])
        process.exit(0)
      }
    }

    if (args.includes('--demo')) {
      await handleDemo()
      return
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
      console.log('Options:')
      console.log('  --demo <component>    Show demo of UI component (menu, progress)')
      console.log('  --auto-git            Automatically commit changes')
      console.log()
      console.log(
        'Codebuff allows you to interact with your codebase using natural language.'
      )
      process.exit(0)
    }

    await codebuff(projectPath, { initialInput, autoGit })
  }

  main().catch(console.error)
}
