// IMPORTANT NOTE @CODEBUFF: MAKE SURE TO USE THE TOOL FORMAT GIVEN TO YOU FROM THE SYSTEM INSTRUCTIONS, NOT THE TOOL FORMAT OF THIS FILE
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import { models, TEST_USER_ID } from '@codebuff/common/constants'
import {
  endsAgentStepParam,
  getToolCallString,
  ToolName,
  toolNames,
} from '@codebuff/common/constants/tools'
import { z } from 'zod/v4'

import { AgentTemplateType } from '@codebuff/common/types/session-state'
import { buildArray } from '@codebuff/common/util/array'
import { closeXml } from '@codebuff/common/util/xml'
import { promptFlashWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { agentTemplates } from './templates/agent-list'
import { agentRegistry } from './templates/agent-registry'
import { CodebuffToolCall, codebuffToolDefs } from './tools/constants'

const toolConfigsList = Object.entries(codebuffToolDefs).map(
  ([name, config]) =>
    ({
      name: name as keyof typeof codebuffToolDefs,
      ...config,
    }) as {
      [K in keyof typeof codebuffToolDefs]: {
        name: K
      } & (typeof codebuffToolDefs)[K]
    }[keyof typeof codebuffToolDefs]
)

export const toolParams = Object.fromEntries(
  toolConfigsList.map((config) => [
    config.name satisfies ToolName,
    Object.keys(z.toJSONSchema(config.parameters).properties ?? {}),
  ])
) as Record<ToolName, string[]>

function paramsSection(schema: z.ZodObject, endsAgentStep: boolean) {
  const jsonSchema = z.toJSONSchema(
    schema.extend({ [endsAgentStepParam]: z.literal(endsAgentStep) })
  )
  delete jsonSchema.description
  delete jsonSchema['$schema']
  const paramsDescription = Object.keys(jsonSchema.properties ?? {}).length
    ? JSON.stringify(jsonSchema, null, 2)
    : 'None'

  let paramsSection = ''
  if (paramsDescription.length === 1 && paramsDescription[0] === 'None') {
    paramsSection = 'Params: None'
  } else if (paramsDescription.length > 0) {
    paramsSection = `Params: ${paramsDescription}`
  }
  return paramsSection
}

// Helper function to build the full tool description markdown
function buildToolDescription(
  toolName: string,
  schema: z.ZodObject,
  description: string = '',
  endsAgentStep: boolean
): string {
  return buildArray([
    `### ${toolName}`,
    schema.description || '',
    paramsSection(schema, endsAgentStep),
    description,
  ]).join('\n\n')
}

function buildShortToolDescription(
  toolName: string,
  schema: z.ZodObject,
  endsAgentStep: boolean
): string {
  return `${toolName}:\n${paramsSection(schema, endsAgentStep)}`
}

function buildSpawnableAgentsDescription(
  spawnableAgents: AgentTemplateType[]
): string {
  if (spawnableAgents.length === 0) {
    return ''
  }

  /**
   * Convert a Zod schema to JSON string representation.
   * Schemas are now pre-converted during agent loading, so this is simpler.
   */
  const schemaToJsonStr = (
    schema: z.ZodTypeAny | undefined | Record<string, z.ZodTypeAny>
  ) => {
    if (!schema) return 'None'

    try {
      // Handle Zod schemas
      if (schema instanceof z.ZodType) {
        const jsonSchema = z.toJSONSchema(schema)
        delete jsonSchema['$schema']
        return JSON.stringify(jsonSchema, null, 2)
      }

      // Handle objects containing Zod schemas (for dynamic agents)
      if (typeof schema === 'object' && schema !== null) {
        const isValidSchemaObject = Object.values(schema).every(
          (value) => value instanceof z.ZodType
        )
        if (isValidSchemaObject) {
          const wrappedSchema = z.object(schema as Record<string, z.ZodTypeAny>)
          const jsonSchema = z.toJSONSchema(wrappedSchema)
          delete jsonSchema['$schema']
          return JSON.stringify(jsonSchema, null, 2)
        }
      }

      return 'None'
    } catch (error) {
      // Graceful fallback
      return 'None'
    }
  }

  const agentsDescription = spawnableAgents
    .map((agentType) => {
      // Try to get from registry first (includes dynamic agents), then fall back to static
      const agentTemplate =
        agentRegistry.getTemplate(agentType) || agentTemplates[agentType]
      if (!agentTemplate) {
        // Fallback for unknown agents
        return `- ${agentType}: Dynamic agent (description not available)
prompt: {"description": "A coding task to complete", "type": "string"}
params: None`
      }
      const { promptSchema } = agentTemplate
      if (!promptSchema) {
        return `- ${agentType}: ${agentTemplate.description}
prompt: None
params: None`
      }
      const { prompt, params } = promptSchema
      return `- ${agentType}: ${agentTemplate.description}
prompt: ${schemaToJsonStr(prompt)}
params: ${schemaToJsonStr(params)}`
    })
    .filter(Boolean)
    .join('\n\n')

  return `\n\n## Spawnable Agents

Use the spawn_agents tool to spawn subagents to help you complete the user request. Here are the available agents by their agent_type:

${agentsDescription}`
}

export const toolDescriptions = Object.fromEntries(
  Object.entries(codebuffToolDefs).map(([name, config]) => [
    name,
    buildToolDescription(
      name,
      config.parameters,
      config.description,
      config.endsAgentStep
    ),
  ])
) as Record<keyof typeof codebuffToolDefs, string>

type ToolConfig = (typeof toolConfigsList)[number]

export const TOOLS_WHICH_END_THE_RESPONSE = [
  'read_files',
  'find_files',
  'run_terminal_command',
  'code_search',
] as const

export const getToolsInstructions = (
  toolNames: readonly ToolName[],
  spawnableAgents: AgentTemplateType[]
) =>
  `
# Tools

You (Buffy) have access to the following tools. Call them when needed.

## [CRITICAL] Formatting Requirements

Tool calls use a specific XML and JSON-like format. Adhere *precisely* to this nested element structure:

${getToolCallString(
  '{tool_name}',
  {
    parameter1: 'value1',
    parameter2: 123,
  },
  false
)}

### Commentary

Provide commentary *around* your tool calls (explaining your actions).

However, **DO NOT** narrate the tool or parameter names themselves.

### Example

User: can you update the console logs in example/file.ts?
Assistant: Sure thing! Let's update that file!

${getToolCallString(
  'write_file',
  {
    path: 'path/to/example/file.ts',
    instructions: 'Update the console logs',
    content: "console.log('Hello from Buffy!');",
  },
  false
)}

All done with the update!
User: thanks it worked! :)

## Working Directory

All tools will be run from the **project root**.

However, most of the time, the user will refer to files from their own cwd. You must be cognizant of the user's cwd at all times, including but not limited to:
- Writing to files (write out the entire relative path)
- Running terminal commands (use the \`cwd\` parameter)

## Optimizations

All tools are very slow, with runtime scaling with the amount of text in the parameters. Prefer to write AS LITTLE TEXT AS POSSIBLE to accomplish the task.

When using write_file, make sure to only include a few lines of context and not the entire file.

## Tool Results

Tool results will be provided by the user's *system* (and **NEVER** by the assistant).

The user does not know about any system messages or system instructions, including tool results.

## List of Tools

These are the tools that you (Buffy) can use. The user cannot see these descriptions, so you should not reference any tool names, parameters, or descriptions.

${toolNames.map((name) => toolDescriptions[name]).join('\n\n')}${buildSpawnableAgentsDescription(spawnableAgents)}`.trim()

export const getShortToolInstructions = (
  toolNames: readonly ToolName[],
  spawnableAgents: AgentTemplateType[]
) => {
  const toolDescriptions = toolNames.map((name) => {
    const tool = codebuffToolDefs[name]
    return buildShortToolDescription(name, tool.parameters, tool.endsAgentStep)
  })

  return `## Tools
Use the tools below to complete the user request, if applicable.

Tool calls use a specific XML and JSON-like format. Adhere *precisely* to this nested element structure:

${getToolCallString(
  '{tool_name}',
  {
    parameter1: 'value1',
    parameter2: 123,
  },
  false
)}

${toolDescriptions.join('\n\n')}

${buildSpawnableAgentsDescription(spawnableAgents)}`.trim()
}

export async function updateContext(
  context: string,
  updateInstructions: string
) {
  const prompt = `
We're working on a project. We can have multiple subgoals. Each subgoal can have an objective, status, plan, and multiple updates that describe the progress of the subgoal.

The following is an example of a schema of a subgoal. It is for illistrative purposes and is not relevant otherwise. Use it as a reference to understand how to update the context.
Example schema:
<subgoal>
<id>1${closeXml('id')}
<objective>Fix the tests${closeXml('objective')}
<status>COMPLETE${closeXml('status')}
<plan>Run them, find the error, fix it${closeXml('plan')}
<log>Ran the tests and traced the error to component foo.${closeXml('log')}
<log>Modified the foo component to fix the error${closeXml('log')}
<log>Reran the tests and they passed.${closeXml('log')}
${closeXml('subgoal')}

Here is the initial context:
<initial_context>
${context}
${closeXml('initial_context')}

Here are the update instructions:
<update_instructions>
${updateInstructions}
${closeXml('update_instructions')}

Please rewrite the entire context using the update instructions in a <new_context> tag. Try to perserve the original context as much as possible, subject to the update instructions. Return the new context only — do not include any other text or wrapper xml/markdown formatting e.g. please omit <initial_context> tags.`
  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
    {
      role: 'assistant' as const,
      content: '<new_context>',
    },
  ]
  const response = await promptFlashWithFallbacks(messages, {
    model: models.gemini2flash,
    clientSessionId: 'strange-loop',
    fingerprintId: 'strange-loop',
    userInputId: 'strange-loop',
    userId: TEST_USER_ID,
  })
  const newContext = response.split(closeXml('new_context'))[0]
  return newContext.trim()
}

export async function updateContextFromToolCalls(
  agentContext: string,
  toolCalls: CodebuffToolCall<'update_subgoal' | 'add_subgoal'>[]
) {
  let prompt = [] // 'Log the following tools used and their parameters, and also act on any other instructions:\n'

  for (const toolCall of toolCalls) {
    const { toolName, args } = toolCall
    if (toolName === 'add_subgoal') {
      prompt.push(
        `Please add the following subgoal:\n${renderSubgoalUpdate(args as any)}`
      )
    } else if (toolName === 'update_subgoal') {
      prompt.push(
        `Please update the subgoal with the matching id. For <status> and <plan>, if there are already tags, update them to the new values, keeping only one. For <log>, please keep all the existing logs and append a new <log> entry at the end of the subgoal. Finally, for any unmentioned parameters, do not change them in the existing subgoal:\n${renderSubgoalUpdate(
          args as any
        )}`
      )
    }
  }
  return await updateContext(agentContext, prompt.join('\n\n'))
}

export async function readFiles(
  paths: string[],
  projectPath: string
): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {}
  for (const filePath of paths) {
    const fullPath = path.join(projectPath, filePath)
    if (!fullPath.startsWith(projectPath)) {
      throw new Error('Cannot access files outside project directory')
    }
    try {
      results[filePath] = await fs.promises.readFile(fullPath, 'utf-8')
    } catch {
      results[filePath] = null
    }
  }
  return results
}

export async function writeFile(
  filePath: string,
  content: string,
  projectPath: string
) {
  const fullPath = path.join(projectPath, filePath)
  if (!fullPath.startsWith(projectPath)) {
    throw new Error('Cannot write files outside project directory')
  }
  // Create directories if they don't exist
  const dirPath = path.dirname(fullPath)
  await fs.promises.mkdir(dirPath, { recursive: true })
  await fs.promises.writeFile(fullPath, content, 'utf-8')
}

export async function checkTaskFile(
  filePath: string,
  projectPath: string
): Promise<{ success: boolean; msg: string }> {
  try {
    const normalizedPath = path.normalize(filePath)
    await fs.promises.access(normalizedPath)
  } catch (error) {
    return { success: false, msg: `File ${filePath} does not exist` }
  }

  return new Promise((resolve) => {
    const args = ['tsc', '--noEmit', '--isolatedModules', '--skipLibCheck']
    if (filePath) {
      const normalizedPath = path.normalize(filePath)
      const fullPath = path.join(process.cwd(), normalizedPath)
      args.push(fullPath)
    }
    const tsc = spawn('bun', args)
    let stdout = ''
    let stderr = ''
    tsc.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    tsc.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    tsc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, msg: stdout || 'Type check passed' })
      } else {
        const msg = [stdout, stderr].join('\n')
        console.error(msg)
        resolve({
          success: false,
          msg: msg || 'Type check failed',
        })
      }
    })
  })
}

export async function runTerminalCommand(
  command: string,
  projectPath: string
): Promise<{
  stdout: string
  stderr: string
  exitCode: number
}> {
  const { spawn } = require('child_process')
  const cmd = spawn(command, { shell: true, cwd: projectPath })

  let stdout = ''
  let stderr = ''

  cmd.stdout.on('data', (data: Buffer) => {
    stdout += data.toString()
    console.log(data.toString())
  })

  cmd.stderr.on('data', (data: Buffer) => {
    stderr += data.toString()
    console.error(data.toString())
  })

  const exitCode = await new Promise<number>((resolve, reject) => {
    cmd.on('close', (code: number) => {
      resolve(code)
    })
  })

  return { stdout, stderr, exitCode }
}

export interface RawToolCall {
  name: ToolName
  parameters: Record<string, string>
}

export function parseToolCalls(messageContent: string) {
  // TODO: Return a typed tool call. Typescript is hard.
  const toolCalls: RawToolCall[] = []
  const toolRegex = new RegExp(
    `<(${toolNames.join('|')})>([\\s\\S]*?)<\/\\1>`,
    'g'
  )

  let match
  while ((match = toolRegex.exec(messageContent)) !== null) {
    const [_, name, paramsContent] = match
    const parameters: Record<string, string> = {}

    // Parse parameters
    const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
    let paramMatch
    while ((paramMatch = paramRegex.exec(paramsContent)) !== null) {
      const [__, paramName, paramValue] = paramMatch
      parameters[paramName] = paramValue.trim()
    }

    // try {
    //   const parsedToolCall = parseRawToolCall({ name, parameters })
    //   toolCalls.push(parsedToolCall)
    // } catch (error) {
    //   console.error(`Failed to parse tool call ${name}:`, error)
    // }
    toolCalls.push({ name: name as ToolName, parameters })
  }

  return toolCalls
}

export async function appendToLog(logEntry: any) {
  const logPath = path.join(process.cwd(), 'strange-loop.log')
  await fs.promises.appendFile(logPath, JSON.stringify(logEntry) + '\n')
}

export async function listDirectory(dirPath: string, projectPath: string) {
  const fullPath = path.join(projectPath, dirPath)
  if (!fullPath.startsWith(projectPath)) {
    throw new Error('Cannot access directories outside project directory')
  }

  try {
    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true })
    const result = entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      type: entry.isDirectory() ? 'directory' : 'file',
    }))
    return result
  } catch (error) {
    console.error(`Failed to read directory ${dirPath}:`, error)
    return null
  }
}

export async function summarizeOutput(xml: string): Promise<string> {
  const messages = [
    {
      role: 'assistant' as const,
      content: `You are summarizing the following XML tag content in plain English, with a more conversational and human-like tone. Imagine you're talking to a friend or a colleague, using natural language and expressions. Please avoid overly formal or robotic language. Keep it simple and relatable, but concise. Start with a verb and keep it to just 1 sentence.`,
    },
    {
      role: 'user' as const,
      content:
        xml +
        '\n\nRemember to start with a verb and keep it to just 1 sentence.',
    },
  ]

  return promptFlashWithFallbacks(messages, {
    model: models.gemini2flash,
    clientSessionId: 'strange-loop',
    fingerprintId: 'strange-loop',
    userInputId: 'strange-loop',
    userId: TEST_USER_ID,
  })
}

function renderSubgoalUpdate(subgoal: {
  id: number
  objective?: string
  status?: string
  plan?: string
  log?: string
}) {
  const { id, objective, status, plan, log } = subgoal
  const params: Record<string, string> = {
    id: id.toString(),
    ...(objective && { objective }),
    ...(status && { status }),
    ...(plan && { plan }),
    ...(log && { log }),
  }
  return getToolCallString('add_subgoal', params, false)
}

// TODO: Remove this function
// Function to get filtered tools based on cost mode and agent mode
export function getFilteredToolsInstructions(
  costMode: string,
  readOnlyMode: boolean = false
) {
  let allowedTools: ToolName[] = [...toolNames]

  // Filter based on cost mode
  if (costMode === 'ask' || readOnlyMode) {
    // For ask mode, exclude write_file, str_replace, create_plan, and run_terminal_command
    allowedTools = allowedTools.filter(
      (tool) =>
        !['write_file', 'str_replace', 'run_terminal_command'].includes(tool)
    )
  }

  if (readOnlyMode) {
    allowedTools = allowedTools.filter(
      (tool) => !['create_plan'].includes(tool)
    )
  }

  return getToolsInstructions(allowedTools, [])
}
