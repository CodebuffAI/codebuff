import { z } from 'zod/v4'

import type { ToolResultOutput } from '../../common/src/types/messages/content-part'
import type { JSONSchema } from 'zod/v4/core'

export type CustomToolDefinition<
  N extends string = string,
  Args extends any = any,
  Input extends any = any,
  Output extends ToolResultOutput[] = ToolResultOutput[],
> = {
  toolName: N
  zodSchema: z.ZodType<Args, Input>
  inputJsonSchema: JSONSchema.BaseSchema
  outputSchema: z.ZodType<ToolResultOutput[], Output>
  description: string
  endsAgentStep: boolean
  exampleInputs: Input[]
  execute: (params: Args) => Promise<Output>
}

/**
 * Creates a CustomToolDefinition object
 *
 * @param toolName the name of the tool
 * @param inputSchema a Zod4 schema describing the input of the tool.
 * @param outputSchema a Zod4 schema describing the output of the tool.
 * @param description a description of the tool to be passed to the LLM. This should describe what the tool does and when to use it.
 * @param endsAgentStep whether the tool ends the agent step. If `true`, this will be used as a "stop sequence" for the LLM. i.e. it will not be able to call any other tools after this one in a single step and must wait for the tool results. Used for tools that give more information to the LLM.
 * @param exampleInputs an array of example inputs for the tool.
 * @param execute what to do when the tool is called. Can be either a sync or async.
 * @returns The CustomToolDefinition object
 */
export function getCustomToolDefinition<
  ToolName extends string,
  Args extends any,
  Input extends any,
  Output extends ToolResultOutput[],
>({
  toolName,
  inputSchema,
  outputSchema,
  description,
  endsAgentStep = true,
  exampleInputs = [],
  execute,
}: {
  toolName: ToolName
  inputSchema: z.ZodType<Args, Input>
  outputSchema: z.ZodType<ToolResultOutput[], Output>
  description: string
  endsAgentStep?: boolean
  exampleInputs?: Input[]
  execute: (params: Args) => Promise<Output> | Output
}): CustomToolDefinition<ToolName, Args, Input, Output> {
  return {
    toolName,
    zodSchema: inputSchema,
    inputJsonSchema: z.toJSONSchema(inputSchema, { io: 'input' }),
    outputSchema,
    description,
    endsAgentStep,
    exampleInputs,
    execute: async (params) => {
      return await execute(params)
    },
  }
}
