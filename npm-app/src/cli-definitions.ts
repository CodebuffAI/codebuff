export interface CliParam {
  flags: string
  description: string
  menuDescription?: string
  menuDetails?: string[]
  hidden?: boolean
}

export const cliArguments: CliParam[] = [
  {
    flags: '[project-directory]',
    description: 'Project directory (default: current directory)',
  },
  {
    flags: '[initial-prompt...]',
    description: 'Initial prompt to send',
    menuDescription: 'Initial prompt to send to Codebuff',
  },
]

export const cliOptions: CliParam[] = [
  {
    flags: '--create <template> [name]',
    description: 'Create new project from template',
    menuDetails: [
      'Available templates: nextjs, convex, vite, remix, node-cli,',
      'python-cli, chrome-extension',
      'See all: https://github.com/CodebuffAI/codebuff-community',
    ],
  },
  {
    flags: '--init',
    description:
      'Initialize codebuff on this project for a smoother experience',
    menuDescription: 'Initialize Codebuff for the project',
  },
  {
    flags: '--model <model>',
    description:
      'Experimental: Specify the main model to use for the agent ("sonnet-3.6", "sonnet-3.7", "gpt-4.1", "gemini-2.5-pro", "o4-mini", "o3"). Be aware codebuff might not work as well with non-default models.',
    menuDescription: 'Specify main LLM (e.g., "sonnet-3.7") (Experimental)',
    hidden: true,
  },
  {
    flags: '--lite',
    description: 'Use budget models & fetch fewer files',
    menuDescription: 'Use budget models & fetch fewer files (faster)',
    hidden: false,
  },
  {
    flags: '--max',
    description: 'Use higher quality models and fetch more files',
    menuDescription:
      'Use higher quality models and fetch more files (thorough)',
    hidden: false,
  },
  {
    flags: '--experimental',
    description: 'Use cutting-edge experimental features and models',
    hidden: true,
  },
]
