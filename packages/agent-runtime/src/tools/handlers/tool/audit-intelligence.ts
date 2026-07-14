import type { CodebuffToolHandlerFunction } from '../handler-function-type'

export const handleInspectCodebaseStructure = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
}) => {
  await previousToolCallFinished
  return {
    output: await requestClientToolCall({
      toolName: 'inspect_codebase_structure',
      toolCallId: toolCall.toolCallId,
      input: toolCall.input,
    }),
  }
}) satisfies CodebuffToolHandlerFunction<'inspect_codebase_structure'>

export const handleInspectFeatureCompleteness = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
}) => {
  await previousToolCallFinished
  return {
    output: await requestClientToolCall({
      toolName: 'inspect_feature_completeness',
      toolCallId: toolCall.toolCallId,
      input: toolCall.input,
    }),
  }
}) satisfies CodebuffToolHandlerFunction<'inspect_feature_completeness'>

export const handleEvaluateAuditCoverage = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
}) => {
  await previousToolCallFinished
  return {
    output: await requestClientToolCall({
      toolName: 'evaluate_audit_coverage',
      toolCallId: toolCall.toolCallId,
      input: toolCall.input,
    }),
  }
}) satisfies CodebuffToolHandlerFunction<'evaluate_audit_coverage'>
