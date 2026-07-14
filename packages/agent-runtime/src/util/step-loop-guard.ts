import { getContentHash } from '@codebuff/common/util/content-hash'

export const REPEATED_STEP_LOOP_LIMIT = 6

export function evaluateRepeatedStepLoop(params: {
  previousSignature?: string
  previousRepeatCount?: number
  toolCalls: Array<{ toolName: string; input: unknown }>
  toolResults: Array<{ toolName: string; content: unknown }>
  isThinkOnly: boolean
  responseText: string
  shouldEndTurn: boolean
}): {
  signature?: string
  repeatCount: number
  shouldStop: boolean
} {
  if (params.shouldEndTurn) {
    return { signature: undefined, repeatCount: 0, shouldStop: false }
  }

  const signaturePayload =
    params.toolCalls.length > 0
      ? {
          toolCalls: params.toolCalls.map(({ toolName, input }) => ({
            toolName,
            input,
          })),
          toolResults: params.toolResults.map(({ toolName, content }) => ({
            toolName,
            content,
          })),
        }
      : params.isThinkOnly
        ? { thinkOnly: true }
        : params.responseText.trim()
          ? { responseText: params.responseText.trim() }
          : undefined

  if (!signaturePayload) {
    return { signature: undefined, repeatCount: 0, shouldStop: false }
  }

  const signature = getContentHash(JSON.stringify(signaturePayload))
  const repeatCount =
    signature === params.previousSignature
      ? (params.previousRepeatCount ?? 0) + 1
      : 1

  return {
    signature,
    repeatCount,
    shouldStop: repeatCount >= REPEATED_STEP_LOOP_LIMIT,
  }
}
