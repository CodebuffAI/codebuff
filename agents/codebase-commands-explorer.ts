import type { AgentDefinition } from '../.agents/types/agent-definition'

const definition: AgentDefinition = {
  id: 'codebase-commands-explorer',
  displayName: 'Codebase Commands Explorer',
  publisher: 'codebuff',
  model: 'x-ai/grok-code-fast-1',

  spawnerPrompt: `Analyzes any project's codebase to comprehensively discover all commands needed to build, test, and run the project. Provides detailed analysis of project structure, tech stack, and working commands with confidence scores.`,

  toolNames: ['spawn_agents', 'read_files', 'set_output'],
  spawnableAgents: [
    'file-picker',
    'code-searcher',
    'directory-lister',
    'glob-matcher',
    'commander',
  ],

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Optional specific focus areas or requirements for the codebase analysis (e.g., "focus on test commands")',
    },
  },

  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      projectOverview: {
        type: 'object',
        properties: {
          projectType: {
            type: 'string',
            description:
              'Primary project type (e.g., Node.js, Python, Rust, Go, etc.)',
          },
          techStack: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of technologies, frameworks, and tools detected',
          },
          packageManagers: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Package managers found (npm, yarn, pnpm, pip, cargo, etc.)',
          },
          buildSystems: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Build systems detected (webpack, vite, make, cmake, etc.)',
          },
          keyFiles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Key configuration files found',
          },
        },
        required: [
          'projectType',
          'techStack',
          'packageManagers',
          'buildSystems',
          'keyFiles',
        ],
      },
      workingCommands: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The working command' },
            description: {
              type: 'string',
              description: 'What this command does',
            },
            category: {
              type: 'string',
              enum: [
                'build',
                'test',
                'run',
                'lint',
                'format',
                'install',
                'clean',
                'dev',
              ],
              description: 'Command category',
            },
            confidenceScore: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confidence that this command works (0-1)',
            },
            workingDirectory: {
              type: 'string',
              description: 'Directory where command should be run',
            },
            prerequisites: {
              type: 'array',
              items: { type: 'string' },
              description: 'Commands that should be run first',
            },
            environment: {
              type: 'string',
              description: 'Required environment or conditions',
            },
          },
          required: ['command', 'description', 'category', 'confidenceScore'],
        },
      },
    },
    required: ['projectOverview', 'workingCommands'],
  },

  systemPrompt: `You are an expert codebase explorer that comprehensively analyzes any software project to discover all build, test, and lint commands. You orchestrate multiple specialized agents to explore the project structure and test commands in parallel for maximum efficiency.`,

  instructionsPrompt: `Your mission is to discover the commands for building, testing, and linting the project, according to the user prompt. Focus on the top level commands and then the commands per sub-package.`,
}

export default definition
