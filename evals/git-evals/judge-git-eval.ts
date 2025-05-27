import { promptAiSdkStructured } from 'backend/src/llm-apis/vercel-ai-sdk/ai-sdk'
import { geminiModels } from 'common/constants'
import { generateCompactId } from 'common/util/string'
import { countTokens } from 'backend/src/util/token-counter'
import { EvalRunLog, JudgingAnalysisSchema } from './types'
import { createPatch } from 'diff'

const MAX_TOKENS = 1_000_000 // 1 million token limit

function buildAnalysisPrompt(
  evalRun: EvalRunLog,
  includeBeforeContent: boolean,
  includeAfterContent: boolean,
  truncatedTrace?: string
): string {
  // Format timing information
  const durationSeconds = (evalRun.durationMs / 1000).toFixed(1)

  // Build ground truth changes section
  const groundTruthChanges = evalRun.eval_commit.fileStates
    .map((state) => {
      const diff = createPatch(state.path, state.preContent, state.postContent)
      let content = `File: ${state.path}\n\nUnified Diff (Ground Truth):\n${diff}`
      
      if (includeBeforeContent) {
        content += `\n\nPre-commit content:\n${state.preContent}`
      }
      
      if (includeAfterContent) {
        content += `\n\nPost-commit content (Ground Truth):\n${state.postContent}`
      }
      
      return content
    })
    .join('\n\n---\n\n')

  // Build Codebuff changes section
  const codebuffChanges = evalRun.fileStates
    .map((state) => {
      const diff = createPatch(state.path, state.preContent, state.postContent)
      let content = `File: ${state.path}\n\nUnified Diff (Codebuff's Changes):\n${diff}`
      
      if (includeBeforeContent) {
        content += `\n\nPre-commit content:\n${state.preContent}`
      }
      
      if (includeAfterContent) {
        content += `\n\nPost-commit content (Codebuff's Attempt):\n${state.postContent}`
      }
      
      return content
    })
    .join('\n\n---\n\n')

  // Build trace section
  const traceContent = truncatedTrace || evalRun.trace
    .map(({ prompt, steps }) =>
      `Prompt: ${prompt}\n\nCodebuff Steps: ${JSON.stringify(steps)}`.trim()
    )
    .join('\n\n')

  return `You are an expert software engineer tasked with analyzing and scoring the code quality of changes made by an AI coding assistant (Codebuff). Please analyze the following interaction trace and compare both the attempted changes and the ground truth changes.

[SPEC]
${evalRun.eval_commit.spec}
[/SPEC]

[TIMING_INFORMATION]
Task Duration: ${durationSeconds} seconds (${evalRun.durationMs}ms)
[/TIMING_INFORMATION]

[GROUND_TRUTH_CHANGES]
${groundTruthChanges}
[/GROUND_TRUTH_CHANGES]

[CHANGES_BY_CODEBUFF]
${codebuffChanges}
[/CHANGES_BY_CODEBUFF]

[TRACE]
${traceContent}
[/TRACE]

[ERROR]
${evalRun.error ? evalRun.error : 'None'}
[/ERROR]

Please analyze the trace of the implementation attempt and provide:
1. A detailed analysis of the implementation trace and the final changes. Include how the changes compare to the ground truth change. Does it have similar behavior at least?
2. Key strengths and weaknesses of the implementation
3. Numerical scores (0-10):
   - Completion: How completely and correctly was the spec implemented compared to the ground truth changes?
   - Efficiency: How efficiently did Codebuff respond to the Agent's prompts without taking unnecessary steps? Speed is important! Consider the task duration of ${durationSeconds} seconds.
   - Code Quality: How well-structured, maintainable and idiomatic is the code?
   - Overall: Combined assessment of the implementation quality

Focus on:
- Correctness and completeness compared to the ground truth changes
- Quality of the code produced
- Minimal changes: it's better to change as little code as possible to accomplish what the agent prompted
- Speed and efficiency: did Codebuff make unnecessary changes or take unnecessary steps? The task took ${durationSeconds} seconds - was this reasonable for the complexity?
- Error: If there was an error encountered, you should give a very low score.

Provide your response in a structured format with analysis, lists of strengths and weaknesses, and metrics.`
}

function truncateTraceFromEnd(trace: any[], maxTokens: number): string {
  // Start with full trace and progressively remove from the end
  let currentTrace = [...trace]
  
  while (currentTrace.length > 0) {
    const traceContent = currentTrace
      .map(({ prompt, steps }) =>
        `Prompt: ${prompt}\n\nCodebuff Steps: ${JSON.stringify(steps)}`.trim()
      )
      .join('\n\n')
    
    if (countTokens(traceContent) <= maxTokens) {
      const truncationNotice = currentTrace.length < trace.length 
        ? `\n\n[TRACE TRUNCATED: Showing ${currentTrace.length} of ${trace.length} trace entries to fit within token limit]`
        : ''
      return traceContent + truncationNotice
    }
    
    // Remove the last entry and try again
    currentTrace.pop()
  }
  
  return '[TRACE TRUNCATED: All trace entries removed to fit within token limit]'
}

export function judgeEvalRun(evalRun: EvalRunLog) {
  let finalPrompt: string | undefined

  // Try different levels of content inclusion until we fit within token limit
  const attempts = [
    { includeBeforeContent: true, includeAfterContent: true, truncatedTrace: undefined },
    { includeBeforeContent: false, includeAfterContent: true, truncatedTrace: undefined },
    { includeBeforeContent: false, includeAfterContent: false, truncatedTrace: undefined },
  ]

  for (const attempt of attempts) {
    const prompt = buildAnalysisPrompt(
      evalRun,
      attempt.includeBeforeContent,
      attempt.includeAfterContent,
      attempt.truncatedTrace
    )
    
    const tokenCount = countTokens(prompt)
    
    if (tokenCount <= MAX_TOKENS) {
      console.log(`Using prompt with ${tokenCount} tokens (before: ${attempt.includeBeforeContent}, after: ${attempt.includeAfterContent})`)
      finalPrompt = prompt
      break
    }
  }

  if (!finalPrompt) {
    // If even without file contents we're still too big, truncate the trace
    // First, calculate base prompt size with empty trace to determine available tokens for trace
    const basePrompt = buildAnalysisPrompt(
      { ...evalRun, trace: [] }, // Empty trace
      false, // includeBeforeContent
      false, // includeAfterContent
      ''     // empty trace content
    )
    const baseTokens = countTokens(basePrompt)
    const maxTraceTokens = MAX_TOKENS - baseTokens - 100 // Reserve 100 tokens for truncation notice
    
    const truncatedTrace = truncateTraceFromEnd(evalRun.trace, maxTraceTokens)
    
    finalPrompt = buildAnalysisPrompt(
      evalRun,
      false, // includeBeforeContent
      false, // includeAfterContent
      truncatedTrace
    )
    
    const finalTokenCount = countTokens(finalPrompt)
    console.log(`Using truncated prompt with ${finalTokenCount} tokens (trace truncated, base: ${baseTokens}, max trace: ${maxTraceTokens})`)
  }

  return promptAiSdkStructured(
    [{ role: 'user', content: finalPrompt }],
    {
      schema: JudgingAnalysisSchema,
      model: geminiModels.gemini2_5_pro_preview,
      clientSessionId: generateCompactId(),
      fingerprintId: generateCompactId(),
      userInputId: generateCompactId(),
      userId: undefined,
    }
  )
}
