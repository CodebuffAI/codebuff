import { endsAgentStepParam, toolNames } from '@codebuff/common/tools/constants'
import { getToolCallString } from '@codebuff/common/tools/utils'
import { buildArray } from '@codebuff/common/util/array'
import { pluralize } from '@codebuff/common/util/string'
import z from 'zod/v4'

import { codebuffToolDefs } from './definitions/list'

import type { ToolName } from '@codebuff/common/tools/constants'
import type { customToolDefinitionsSchema } from '@codebuff/common/util/file'
import type { JSONSchema } from 'zod/v4/core'

function paramsSection(params: {
  schema:
    | { type: 'zod'; value: z.ZodObject }
    | { type: 'json'; value: JSONSchema.BaseSchema }
  endsAgentStep: boolean
}) {
  const { schema, endsAgentStep } = params
  const schemaWithEndsAgentStepParam =
    schema.type === 'zod'
      ? z.toJSONSchema(
          endsAgentStep
            ? schema.value.extend({
                [endsAgentStepParam]: z
                  .literal(endsAgentStep)
                  .describe('Easp flag must be set to true'),
              })
            : schema.value,
          { io: 'input' },
        )
      : JSON.parse(JSON.stringify(schema.value))
  if (schema.type === 'json') {
    if (!schemaWithEndsAgentStepParam.properties) {
      schemaWithEndsAgentStepParam.properties = {}
    }
    schemaWithEndsAgentStepParam.properties[endsAgentStepParam] = {
      const: true,
      type: 'boolean',
      description: 'Easp flag must be set to true',
    }
    if (!schemaWithEndsAgentStepParam.required) {
      schemaWithEndsAgentStepParam.required = []
    }
    schemaWithEndsAgentStepParam.required.push(endsAgentStepParam)
  }

  const jsonSchema = schemaWithEndsAgentStepParam
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
export function buildToolDescription(params: {
  toolName: string
  schema:
    | { type: 'zod'; value: z.ZodObject }
    | { type: 'json'; value: JSONSchema.BaseSchema }
  description?: string
  endsAgentStep: boolean
  exampleInputs?: any[]
}): string {
  const {
    toolName,
    schema,
    description = '',
    endsAgentStep,
    exampleInputs = [],
  } = params
  const descriptionWithExamples = buildArray(
    description,
    exampleInputs.length > 0
      ? `${pluralize(exampleInputs.length, 'Example')}:`
      : '',
    ...exampleInputs.map((example) =>
      getToolCallString(toolName, example, endsAgentStep),
    ),
  ).join('\n\n')
  return buildArray([
    `### ${toolName}`,
    schema.value.description || '',
    paramsSection({ schema, endsAgentStep }),
    descriptionWithExamples,
  ]).join('\n\n')
}

export const toolDescriptions = Object.fromEntries(
  Object.entries(codebuffToolDefs).map(([name, config]) => [
    name,
    buildToolDescription({
      toolName: name,
      schema: { type: 'zod', value: config.parameters },
      description: config.description,
      endsAgentStep: config.endsAgentStep,
    }),
  ]),
) as Record<keyof typeof codebuffToolDefs, string>

function buildShortToolDescription(params: {
  toolName: string
  schema:
    | { type: 'zod'; value: z.ZodObject }
    | { type: 'json'; value: JSONSchema.BaseSchema }
  endsAgentStep: boolean
}): string {
  const { toolName, schema, endsAgentStep } = params
  return `${toolName}:\n${paramsSection({ schema, endsAgentStep })}`
}

export const getToolsInstructions = (
  tools: readonly string[],
  additionalToolDefinitions: z.infer<typeof customToolDefinitionsSchema>,
) => {
  if (
    tools.length === 0 &&
    Object.keys(additionalToolDefinitions).length === 0
  ) {
    return ''
  }

  return `
# Tools

You (Buffy) have access to the following tools. Call them when needed.

## [CRITICAL] Formatting Requirements

Tool calls use a specific XML and JSON-like format. Adhere *precisely* to this nested element structure:

${getToolCallString(
  'tool_name',
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

${getToolCallString(
  'example_editing_tool',
  {
    example_file_path: 'path/to/example/file.ts',
    example_array: [
      {
        old_content_with_newlines:
          "// some context\nconsole.log('Hello world!');\n",
        new_content_with_newlines:
          "// some context\nconsole.log('Hello from Buffy!');\n",
      },
    ],
  },
  false,
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
${fullToolList(tools, additionalToolDefinitions)}
`
}

export const fullToolList = (
  toolNames: readonly string[],
  additionalToolDefinitions: z.infer<typeof customToolDefinitionsSchema>,
) => {
  if (
    toolNames.length === 0 &&
    Object.keys(additionalToolDefinitions).length === 0
  ) {
    return ''
  }

  return `## List of Tools

These are the only tools that you (Buffy) can use. The user cannot see these descriptions, so you should not reference any tool names, parameters, or descriptions. Do not try to use any other tools -- even if referenced earlier in the conversation, they are not available to you, instead they may have been previously used by other agents.

${[
  ...(
    toolNames.filter((toolName) =>
      toolNames.includes(toolName as ToolName),
    ) as ToolName[]
  ).map((name) => toolDescriptions[name]),
  ...Object.keys(additionalToolDefinitions).map((toolName) => {
    const toolDef = additionalToolDefinitions[toolName]
    return buildToolDescription({
      toolName,
      schema: { type: 'json', value: toolDef.inputJsonSchema },
      description: toolDef.description,
      endsAgentStep: toolDef.endsAgentStep,
      exampleInputs: toolDef.exampleInputs,
    })
  }),
].join('\n\n')}`.trim()
}

export const getShortToolInstructions = (
  toolNames: readonly string[],
  additionalToolDefinitions: z.infer<typeof customToolDefinitionsSchema>,
) => {
  if (
    toolNames.length === 0 &&
    Object.keys(additionalToolDefinitions).length === 0
  ) {
    return ''
  }

  const toolDescriptions = [
    ...(
      toolNames.filter(
        (name) => (name as keyof typeof codebuffToolDefs) in codebuffToolDefs,
      ) as (keyof typeof codebuffToolDefs)[]
    ).map((name) => {
      const tool = codebuffToolDefs[name]
      return buildShortToolDescription({
        toolName: name,
        schema: { type: 'zod', value: tool.parameters },
        endsAgentStep: tool.endsAgentStep,
      })
    }),
    ...Object.keys(additionalToolDefinitions).map((name) => {
      const { inputJsonSchema, endsAgentStep } = additionalToolDefinitions[name]
      return buildShortToolDescription({
        toolName: name,
        schema: { type: 'json', value: inputJsonSchema },
        endsAgentStep,
      })
    }),
  ]

  return `## Tools
Use the tools below to complete the user request, if applicable.

Tool calls use a specific XML and JSON-like format. Adhere *precisely* to this nested element structure:

${getToolCallString(
  'tool_name',
  {
    parameter1: 'value1',
    parameter2: 123,
  },
  false,
)}

Important: You only have access to the tools below. Do not use any other tools -- they are not available to you, instead they may have been previously used by other agents.

${toolDescriptions.join('\n\n')}
`.trim()
}
