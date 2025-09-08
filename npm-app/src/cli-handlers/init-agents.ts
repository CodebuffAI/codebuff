import * as fs from 'fs'
import * as path from 'path'

import { AGENT_TEMPLATES_DIR } from '@codebuff/common/old-constants'
import { green, gray } from 'picocolors'

// Import files to replicate in the user's .agents directory. Bun bundler requires relative paths.

import basicDiffReviewer from '../../../common/src/templates/initial-agents-dir/examples/01-basic-diff-reviewer' with { type: 'text' }
import intermediateGitCommitter from '../../../common/src/templates/initial-agents-dir/examples/02-intermediate-git-committer' with { type: 'text' }
import advancedFileExplorer from '../../../common/src/templates/initial-agents-dir/examples/03-advanced-file-explorer' with { type: 'text' }
import myCustomAgent from '../../../common/src/templates/initial-agents-dir/my-custom-agent' with { type: 'text' }

// @ts-ignore - No default import, but we are importing as text so it's fine
// @ts-ignore - It complains about the .md file, but it works.
import readmeContent from '../../../common/src/templates/initial-agents-dir/README.md' with { type: 'text' }
// @ts-ignore - No default import, but we are importing as text so it's fine
import agentDefinitionTypes from '../../../common/src/templates/initial-agents-dir/types/agent-definition' with { type: 'text' }
// @ts-ignore - No default import, but we are importing as text so it's fine
import utilTypes from '../../../common/src/templates/initial-agents-dir/types/util-types' with { type: 'text' }
// @ts-ignore - No default import, but we are importing as text so it's fine
import toolsTypes from '../../../common/src/templates/initial-agents-dir/types/tools' with { type: 'text' }

import { getProjectRoot } from '../project-files'

/**
 * Create example agent files in the .agents directory
 * This function is shared between the /agents command and the codebuff init-agents command
 */
export async function createExampleAgentFiles() {
  const agentsDir = path.join(getProjectRoot(), AGENT_TEMPLATES_DIR)
  const typesDir = path.join(agentsDir, 'types')
  const examplesDir = path.join(agentsDir, 'examples')

  // Create directories
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true })
  }
  if (!fs.existsSync(typesDir)) {
    fs.mkdirSync(typesDir, { recursive: true })
  }
  if (!fs.existsSync(examplesDir)) {
    fs.mkdirSync(examplesDir, { recursive: true })
  }

  const filesToCreate = [
    {
      path: path.join(agentsDir, 'README.md'),
      content: readmeContent,
      description: 'Documentation for your agents',
    },
    {
      path: path.join(typesDir, 'agent-definition.ts'),
      content: agentDefinitionTypes,
      description: 'TypeScript type definitions for agents',
    },
    {
      path: path.join(typesDir, 'tools.ts'),
      content: toolsTypes,
      description: 'TypeScript type definitions for tools',
    },
    {
      path: path.join(typesDir, 'util-types.ts'),
      content: utilTypes,
      description: 'TypeScript type definitions for utility types',
    },
    {
      path: path.join(agentsDir, 'my-custom-agent.ts'),
      content: myCustomAgent,
      description: 'Your first custom agent example',
    },
    {
      path: path.join(examplesDir, '01-basic-diff-reviewer.ts'),
      content: basicDiffReviewer,
      description: 'Basic diff reviewer agent example',
    },
    {
      path: path.join(examplesDir, '02-intermediate-git-committer.ts'),
      content: intermediateGitCommitter,
      description: 'Intermediate git commiter agent example',
    },
    {
      path: path.join(examplesDir, '03-advanced-file-explorer.ts'),
      content: advancedFileExplorer,
      description: 'Advanced file explorer agent example',
    },
  ]

  console.log(green('\n📁 Creating agent files:'))

  for (const file of filesToCreate) {
    fs.writeFileSync(file.path, file.content)
    const relativePath = path.relative(getProjectRoot(), file.path)
    console.log(gray(`  ✓ ${relativePath} - ${file.description}`))
  }
}

/**
 * Handle the codebuff init-agents command
 */
export async function handleInitAgents() {
  try {
    await createExampleAgentFiles()
    console.log(green('\n✅ Created example agent files in .agents directory!'))
    console.log(
      gray('Check out the files and edit them to create your custom agents.'),
    )
    console.log(
      gray('Run "codebuff --agent your-agent-id" to test your agents.'),
    )
  } catch (error) {
    console.error('Error creating example files:', error)
    process.exit(1)
  }
}
