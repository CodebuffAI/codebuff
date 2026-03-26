import { CodebuffClient } from '@codebuff/sdk'

import { contextAgent } from '../../../agents/context-agent'
import { ensureAuth } from '../utils/auth'
import { readConfig } from '../utils/config'
import { readKnowledgeFiles } from '../utils/knowledge'
import { printError, printWarning, Spinner } from '../utils/output'
import { findProjectRoot } from '../utils/project'

interface ContextOptions {
  cwd?: string
  maxFiles?: string
  filesOnly?: boolean
}

export async function contextCommand(
  prompt: string,
  options: ContextOptions,
): Promise<void> {
  try {
    const apiKey = await ensureAuth()
    const projectRoot = findProjectRoot(options.cwd)

    const config = readConfig(projectRoot)
    if (!config) {
      printWarning(
        'evalbuff not initialized. Run "evalbuff init" for better results.',
      )
    }

    const maxFiles = options.maxFiles
      ? parseInt(options.maxFiles, 10)
      : config?.context?.maxFiles ?? 15

    const knowledgeFiles = readKnowledgeFiles(projectRoot)

    const spinner = new Spinner()
    spinner.start('Scanning project structure...')

    const client = new CodebuffClient({ apiKey })

    let agentPrompt = `Task: ${prompt}\n\nReturn up to ${maxFiles} relevant files.`

    if (options.filesOnly) {
      agentPrompt +=
        '\n\nIMPORTANT: Output ONLY file paths, one per line. No markdown, no summaries, no sections. Just file paths.'
    }

    let output = ''

    spinner.update('Finding relevant files...')

    const result = await client.run({
      agent: contextAgent,
      prompt: agentPrompt,
      cwd: projectRoot,
      knowledgeFiles,
      maxAgentSteps: 15,
      handleStreamChunk: (chunk) => {
        if (typeof chunk === 'string') {
          output += chunk
        }
      },
    })

    spinner.stop()

    if (result.output.type === 'error') {
      printError(result.output.message)
      process.exit(2)
    }

    process.stdout.write(output)
    if (output.length > 0 && !output.endsWith('\n')) {
      process.stdout.write('\n')
    }

    process.stderr.write('✓ Done\n')
  } catch (error) {
    printError(
      error instanceof Error
        ? error.message
        : 'Failed to gather context.',
    )
    process.exit(2)
  }
}
