import { promptAiSdkStructured } from 'backend/src/llm-apis/vercel-ai-sdk/ai-sdk'
import { geminiModels } from 'common/constants'
import { generateCompactId } from 'common/util/string'
import { EvalRunLog, JudgingAnalysisSchema } from './types'
import { createPatch } from 'diff'

export function judgeEvalRun(evalRun: EvalRunLog) {
  // Format the evaluation data for analysis
  const analysisPrompt = `You are an expert software engineer tasked with analyzing and scoring the code quality of changes made by an AI coding assistant (Codebuff). Please analyze the following interaction trace and compare both the attempted changes and the ground truth changes.

[SPEC]
${evalRun.eval_commit.spec}
[/SPEC]

[GROUND_TRUTH_CHANGES]
${evalRun.eval_commit.fileStates
  .map((state) => {
    const diff = createPatch(state.path, state.preContent, state.postContent)
    return `
File: ${state.path}

Unified Diff (Ground Truth):
${diff}

Pre-commit content:
${state.preContent}

Post-commit content (Ground Truth):
${state.postContent}
`
  })
  .join('\n\n---\n\n')}
[/GROUND_TRUTH_CHANGES]

[CHANGES_BY_CODEBUFF]
${evalRun.afterFileStates // Iterate over files Codebuff actually changed
  .map((codebuffAfterState) => {
    const codebuffBeforeState = evalRun.beforeFileStates.find(
      (s) => s.path === codebuffAfterState.path
    )
    const preContentForDiff =
      codebuffBeforeState?.content ??
      '[PRE_STATE_NOT_FOUND_FOR_CODEBUFF_CHANGE]'
    const postContentForDiff = codebuffAfterState.content

    const diff = createPatch(
      codebuffAfterState.path,
      preContentForDiff,
      postContentForDiff
    )
    return `
File: ${codebuffAfterState.path}

Unified Diff (Codebuff's Changes):
${diff}

Pre-commit content (at ${evalRun.eval_commit.sha}^ for this file):
${preContentForDiff}

Post-commit content (Codebuff's Attempt):
${postContentForDiff}
`
  })
  .join('\n\n---\n\n')}
[/CHANGES_BY_CODEBUFF]

[TRACE]
${evalRun.trace
  .map(({ prompt, steps }) =>
    `
Prompt: ${prompt}

Codebuff Steps: ${JSON.stringify(steps)}
`.trim()
  )
  .join('\n\n')}
[/TRACE]

[ERROR]
${evalRun.error ? evalRun.error : 'None'}
[/ERROR]

Please analyze the trace of the implementation attempt and provide:
1. A detailed analysis of the implementation trace and the final changes. Include how the changes compare to the ground truth change. Does it have similar behavior at least?
2. Key strengths and weaknesses of the implementation
3. Numerical scores (0-10):
   - Completion: How completely and correctly was the spec implemented compared to the ground truth changes?
   - Efficiency: How efficiently did Codebuff respond to the Agent's prompts without taking unnecessary steps? Speed is important!
   - Code Quality: How well-structured, maintainable and idiomatic is the code?
   - Overall: Combined assessment of the implementation quality

Focus on:
- Correctness and completeness compared to the ground truth changes
- Quality of the code produced
- Minimal changes: it's better to change as little code as possible to accomplish what the agent prompted
- Speed and efficiency: did Codebuff make unnecessary changes or take unnecessary steps?
- Error: If there was an error encountered, you should give a very low score.

Provide your response in a structured format with analysis, lists of strengths and weaknesses, and metrics.`

  // Get Gemini's analysis
  return promptAiSdkStructured(
    [
      {
        role: 'user',
        content: analysisPrompt,
      },
    ],
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
