import type {
  FilePart,
  ImagePart,
  ReasoningPart,
  TextPart,
  ToolCallPart,
  ToolResultOutput,
} from './content-part'
import type { ProviderMetadata } from './provider-metadata'
import type { CodebuffToolParams } from '../../tools/list'
import type { ToolSet } from 'ai'
import type z from 'zod/v4'

export type AuxiliaryMessageData = {
  providerOptions?: ProviderMetadata
  tags?: string[]

  // James: All the below is overly prescriptive for the framework.
  // Instead, let's tag what the message is, and let the user decide time to live, keep during truncation, etc.
  /** @deprecated Use tags instead. */
  timeToLive?: 'agentStep' | 'userPrompt'
  /** @deprecated Use tags instead. */
  keepDuringTruncation?: boolean
  /** @deprecated Use tags instead. */
  keepLastTags?: string[]
}

export type SystemMessage = {
  role: 'system'
  content: TextPart[]
} & AuxiliaryMessageData

export type UserMessage = {
  role: 'user'
  content: (TextPart | ImagePart | FilePart)[]
} & AuxiliaryMessageData

type ToolSetInputSchema = Record<
  string,
  Required<Pick<ToolSet[string], 'inputSchema'>>
>
export type AssistantMessage<
  TOOLS extends ToolSetInputSchema = CodebuffToolParams,
> = {
  role: 'assistant'
  content: (TextPart | ReasoningPart | ToolCallPart<TOOLS>)[]
} & AuxiliaryMessageData

type ToolSetOutputSchema = Record<
  string,
  Required<Pick<ToolSet[string], 'outputSchema'>>
>
export type ToolMessage<
  TOOLS extends ToolSetOutputSchema = CodebuffToolParams,
> = {
  role: 'tool'
  toolCallId: string
  toolName: string
  content: ToolResultOutput[]
} & AuxiliaryMessageData &
  {
    [K in keyof TOOLS]: {
      toolName: K
      content: z.infer<TOOLS[K]['outputSchema']>
    }
  }[keyof TOOLS]

export type Message<
  TOOLS extends ToolSetInputSchema & ToolSetOutputSchema = CodebuffToolParams,
> = SystemMessage | UserMessage | AssistantMessage<TOOLS> | ToolMessage<TOOLS>
