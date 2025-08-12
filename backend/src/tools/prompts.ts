import { endsAgentStepParam } from '@codebuff/common/tools/constants'
import { getToolCallString } from '@codebuff/common/tools/utils'
import { buildArray } from '@codebuff/common/util/array'
import z from 'zod'

import { codebuffToolDefs } from './definitions/list'

import type { ToolName } from '@codebuff/common/tools/constants'

function paramsSection(schema: z.ZodObject, endsAgentStep: boolean) {
  const schemaWithEndsAgentStepParam = endsAgentStep
    ? schema.extend({
        [endsAgentStepParam]: z
          .literal(endsAgentStep)
          .describe('Easp flag must be set to true'),
      })
    : schema
  const jsonSchema = z.toJSONSchema(schemaWithEndsAgentStepParam)
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
  endsAgentStep: boolean,
): string {
  return buildArray([
    `### ${toolName}`,
    schema.description || '',
    paramsSection(schema, endsAgentStep),
    description,
  ]).join('\n\n')
}

export const toolDescriptions = Object.fromEntries(
  Object.entries(codebuffToolDefs).map(([name, config]) => [
    name,
    buildToolDescription(
      name,
      config.parameters,
      config.description,
      config.endsAgentStep,
    ),
  ]),
) as Record<keyof typeof codebuffToolDefs, string>

function buildShortToolDescription(
  toolName: string,
  schema: z.ZodObject,
  endsAgentStep: boolean,
): string {
  return `${toolName}:\n${paramsSection(schema, endsAgentStep)}`
}

export const getToolsInstructions = (toolNames: readonly ToolName[]) =>
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
  false,
)}

### Commentary

Provide commentary *around* your tool calls (explaining your actions).

However, **DO NOT** narrate the tool or parameter names themselves.

### Example

User: can you update the console logs in example/file.ts?
Assistant: Sure thing! Let's update that file!

${getToolCallString('str_replace', {
  path: 'path/to/example/file.ts',
  replacements: [
    {
      old: "console.log('Hello world!');\n",
      new: "console.log('Hello from Buffy!');\n",
    },
  ],
})}

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

${toolNames.map((name) => toolDescriptions[name]).join('\n\n')}`.trim()

export const getShortToolInstructions = (toolNames: readonly ToolName[]) => {
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
  false,
)}

${toolDescriptions.join('\n\n')}`.trim()
}
