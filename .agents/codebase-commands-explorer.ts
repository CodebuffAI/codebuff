import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'codebase-commands-explorer',
  displayName: 'Codebase Commands Explorer',
  publisher: 'james',
  model: 'openai/gpt-5',
  reasoningOptions: {
    enabled: true,
    effort: 'low',
    exclude: true,
  },

  spawnerPrompt: `Analyzes any project's codebase to comprehensively discover all commands needed to build, test, and run the project. Provides detailed analysis of project structure, tech stack, and working commands with confidence scores.`,

  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: [
    'codebuff/file-explorer@0.0.4',
    'codebuff/read-only-commander-lite@0.0.1',
  ],

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Optional specific focus areas or requirements for the codebase analysis (e.g., "focus on test commands" or "include CI/CD analysis")',
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
      setupRequirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            requirement: {
              type: 'string',
              description: 'Setup requirement description',
            },
            commands: {
              type: 'array',
              items: { type: 'string' },
              description: 'Commands to fulfill this requirement',
            },
            priority: {
              type: 'string',
              enum: ['critical', 'recommended', 'optional'],
              description: 'Priority level',
            },
          },
          required: ['requirement', 'commands', 'priority'],
        },
      },
      cicdAnalysis: {
        type: 'object',
        properties: {
          ciFilesFound: {
            type: 'array',
            items: { type: 'string' },
            description: 'CI/CD configuration files detected',
          },
          officialCommands: {
            type: 'array',
            items: { type: 'string' },
            description: 'Commands found in CI/CD files',
          },
          platforms: {
            type: 'array',
            items: { type: 'string' },
            description:
              'CI/CD platforms detected (GitHub Actions, GitLab CI, etc.)',
          },
        },
        required: ['ciFilesFound', 'officialCommands', 'platforms'],
      },
    },
    required: [
      'projectOverview',
      'workingCommands',
      'setupRequirements',
      'cicdAnalysis',
    ],
  },

  systemPrompt: `You are an expert codebase explorer that comprehensively analyzes any software project to discover all build, test, and run commands. You orchestrate multiple specialized agents to explore the project structure and test commands in parallel for maximum efficiency.`,

  instructionsPrompt: `Your mission is to provide a comprehensive analysis of any codebase to discover all working commands for building, testing, and running the project.

## Analysis Strategy:

1. **Project Structure Exploration**: First spawn file-explorer to understand the project layout, key files, and technology stack.
  In parallel, spawn a second file-explorer to learn about the build, lint, and testing processes across the codebase.

2. **Massive Parallel Command Testing**: Only after fully completing step 1 and getting back the results, spawn MANY (10-15) read-only-commander agents simultaneously to test different command combinations, including for any relevant sub-directories if this is a monorepo.
  Look for commands for the following project types:
   - Web apps: next.js, react, vue, etc. commands (build, test, start, dev, lint, etc.)
   - Node.js projects: npm/yarn/pnpm commands (build, test, start, dev, lint, etc.)
   - Python projects: pip, pytest, setup.py, tox commands
   - Rust projects: cargo commands (build, test, run, check, etc.)
   ...And so on for all project types

  Include CI/CD Analysis: Have agents examine CI/CD files (.github/workflows, .gitlab-ci.yml, etc.) to discover official build processes

3. **Final Analysis**: Use the set_output tool to output the results of the analysis. Rate each working command based on:
   - Success rate of execution
   - Presence in official documentation/CI
   - Standard conventions for the project type
   - Output quality and expected behavior

## Command Categories to Test:
- **install**: Dependency installation commands
- **build**: Compilation and build commands
- **test**: All types of testing (unit, integration, e2e)
- **run**: Application execution commands
- **dev**: Development server/watch commands
- **lint**: Code linting and static analysis
- **format**: Code formatting commands
- **clean**: Cleanup and reset commands

## Be Extremely Thorough:
- Try multiple package managers if multiple are detected
- Test both short and long command forms
- Check for custom scripts in package.json, Makefile, etc.
- Test commands with different flags and options
- Verify commands work from different directories
- Check for environment-specific requirements

## Special Focus Areas:
- Look for monorepo structures and workspace commands
- Detect containerized setups and associated commands
- Find database setup/migration commands
- Identify development vs production commands
- Discover deployment and release commands

Provide a comprehensive, structured output that gives developers everything they need to understand and work with the codebase immediately.`,
}

export default definition
