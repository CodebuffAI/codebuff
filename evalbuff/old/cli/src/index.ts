#!/usr/bin/env bun
import { Command } from 'commander'

import { contextCommand } from './commands/context'
import { initCommand } from './commands/init'
import { loginCommand } from './commands/login'
import { logoutCommand } from './commands/logout'
import { reviewCommand } from './commands/review'

const program = new Command()
  .name('evalbuff')
  .description(
    'Codebase-specific evals, context, and review for AI coding agents',
  )
  .version('0.1.0')

program
  .command('init')
  .description('Initialize evalbuff in a project')
  .option('--cwd <path>', 'Project root directory')
  .option('--skip-scan', 'Skip the initial project scan')
  .option('--force', 'Overwrite existing configuration without prompting')
  .action(async (options) => {
    await initCommand({
      cwd: options.cwd,
      skipScan: options.skipScan,
      force: options.force,
    })
  })

program
  .command('context')
  .description('Get relevant files, knowledge, and gotchas for a task')
  .argument('<prompt>', 'Description of what you are about to work on')
  .option('--cwd <path>', 'Project root directory')
  .option('--max-files <n>', 'Maximum number of files to return')
  .option('--files-only', 'Output only file paths, one per line')
  .action(async (prompt: string, options) => {
    await contextCommand(prompt, {
      cwd: options.cwd,
      maxFiles: options.maxFiles,
      filesOnly: options.filesOnly,
    })
  })

program
  .command('review')
  .description('Review code changes with structured feedback')
  .argument('[prompt]', 'Description of the original request for goal assessment')
  .option('--cwd <path>', 'Project root directory')
  .option('--files <paths...>', 'Scope the review to specific files')
  .option(
    '--branch [base]',
    'Compare current branch against a base branch',
  )
  .option('--staged', 'Review only staged changes')
  .option('--commit <sha>', 'Review a specific commit')
  .action(async (prompt: string | undefined, options) => {
    await reviewCommand(prompt, {
      cwd: options.cwd,
      files: options.files,
      branch: options.branch,
      staged: options.staged,
      commit: options.commit,
    })
  })

program
  .command('login')
  .description('Authenticate with evalbuff')
  .action(async () => {
    await loginCommand()
  })

program
  .command('logout')
  .description('Clear stored credentials')
  .action(() => {
    logoutCommand()
  })

program.parse()
