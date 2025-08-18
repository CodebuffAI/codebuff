import z from 'zod/v4'

import type { JSONSchema } from 'zod/v4/core'

export type CustomToolDefinition<
  N extends string = string,
  Output = any,
  Input = any,
> = {
  toolName: N
  zodSchema: z.ZodType<Output, Input>
  inputJsonSchema: JSONSchema.BaseSchema
  description?: string
  endsAgentStep: boolean
  exampleInputs: Input[]
  handler: (params: Output) => Promise<{
    toolResultMessage: string
  }>
}

export function getCustomToolDefinintion<
  ToolName extends string,
  Output,
  Input,
>({
  toolName,
  inputSchema,
  description,
  endsAgentStep = false,
  exampleInputs = [],
  handler,
}: {
  toolName: ToolName
  inputSchema: z.ZodType<Output, Input>
  description?: string
  endsAgentStep?: boolean
  exampleInputs?: Input[]
  handler: (params: Output) => Promise<{
    toolResultMessage: string
  }>
}): CustomToolDefinition<ToolName, Output, Input> {
  return {
    toolName,
    zodSchema: inputSchema,
    inputJsonSchema: z.toJSONSchema(inputSchema, { io: 'input' }),
    description,
    endsAgentStep,
    exampleInputs,
    handler,
  }
}
