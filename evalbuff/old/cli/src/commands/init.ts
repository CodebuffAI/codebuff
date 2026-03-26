import fs from 'fs'
import path from 'path'
import readline from 'readline'

import { CodebuffClient } from '@codebuff/sdk'

import { scanAgent } from '../../../agents/scan-agent'
import { SKILL_TEMPLATE } from '../templates/skill'
import { ensureAuth } from '../utils/auth'
import {
  configPath,
  getDefaultConfig,
  readConfig,
  writeConfig,
} from '../utils/config'
import { ensureKnowledgeDir, readKnowledgeFiles } from '../utils/knowledge'
import { printError, Spinner } from '../utils/output'
import { findProjectRoot } from '../utils/project'

interface InitOptions {
  cwd?: string
  skipScan?: boolean
  force?: boolean
}

function promptConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  })
  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

function installSkillFile(projectRoot: string, targetDir: string): string {
  const skillPath = path.join(projectRoot, targetDir, 'evalbuff', 'SKILL.md')
  const dir = path.dirname(skillPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(skillPath, SKILL_TEMPLATE)
  return path.relative(projectRoot, skillPath)
}

export async function initCommand(options: InitOptions): Promise<void> {
  try {
    const apiKey = await ensureAuth()
    const projectRoot = findProjectRoot(options.cwd)

    const existingConfig = readConfig(projectRoot)
    if (existingConfig && !options.force) {
      const shouldOverwrite = await promptConfirm(
        'evalbuff is already initialized. Overwrite config and skill files?',
      )
      if (!shouldOverwrite) {
        process.stderr.write('Aborted.\n')
        return
      }
    }

    const config = getDefaultConfig(projectRoot)
    writeConfig(projectRoot, config)
    const configRelPath = path.relative(projectRoot, configPath(projectRoot))
    process.stderr.write(`✓ Created ${configRelPath}\n`)

    const agentsSkillPath = installSkillFile(
      projectRoot,
      '.agents/skills',
    )
    process.stderr.write(`✓ Installed skill to ${agentsSkillPath}\n`)

    const claudeSkillPath = installSkillFile(
      projectRoot,
      '.claude/skills',
    )
    process.stderr.write(`✓ Installed skill to ${claudeSkillPath}\n`)

    ensureKnowledgeDir(projectRoot)

    if (!options.skipScan) {
      const spinner = new Spinner()
      spinner.start('Scanning project...')

      try {
        const existingKnowledge = readKnowledgeFiles(projectRoot)

        const client = new CodebuffClient({ apiKey })
        let scanPrompt = 'Analyze this project and generate knowledge files.'
        if (Object.keys(existingKnowledge).length > 0) {
          scanPrompt +=
            ' Knowledge files already exist — read them first and merge new observations rather than overwriting.'
        }

        const result = await client.run({
          agent: scanAgent,
          prompt: scanPrompt,
          cwd: projectRoot,
          knowledgeFiles: existingKnowledge,
          maxAgentSteps: 20,
        })

        if (result.output.type === 'error') {
          spinner.fail(`Scan failed: ${result.output.message}`)
        } else {
          spinner.succeed('Generated project knowledge')
        }
      } catch (error) {
        spinner.fail(
          `Scan failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    process.stderr.write(
      `\nEvalbuff is ready! Your coding agents will now automatically use evalbuff for context and review.\n\nTry it:\n  evalbuff context "add user authentication"\n  evalbuff review\n`,
    )
  } catch (error) {
    printError(
      error instanceof Error ? error.message : 'Init failed.',
    )
    process.exit(2)
  }
}
