import z from 'zod/v4'

import type { ToolResultOutput } from '../../common/src/types/messages/content-part'
import type { JSONSchema } from 'zod/v4/core'

export type CustomToolDefinition<
  N extends string = string,
  Args = any,
  Input = any,
  Output extends ToolResultOutput[] = ToolResultOutput[],
> = {
  toolName: N
  zodSchema: z.ZodType<Args, Input>
  inputJsonSchema: JSONSchema.BaseSchema
  outputSchema: z.ZodType<ToolResultOutput[], Output>
  description: string
  endsAgentStep: boolean
  exampleInputs: Input[]
  handler: (params: Args) => Promise<Output>
}

export function getCustomToolDefinition<
  ToolName extends string,
  Args,
  Input,
  Output extends ToolResultOutput[],
>({
  toolName,
  inputSchema,
  outputSchema,
  description,
  endsAgentStep = true,
  exampleInputs = [],
  handler,
}: {
  toolName: ToolName
  inputSchema: z.ZodType<Args, Input>
  outputSchema: z.ZodType<ToolResultOutput[], Output>
  description: string
  endsAgentStep?: boolean
  exampleInputs?: Input[]
  handler: (params: Args) => Promise<Output>
}): CustomToolDefinition<ToolName, Args, Input, Output> {
  return {
    toolName,
    zodSchema: inputSchema,
    inputJsonSchema: z.toJSONSchema(inputSchema, { io: 'input' }),
    outputSchema,
    description,
    endsAgentStep,
    exampleInputs,
    handler,
  }
}
