import { promptAiSdkStructured } from 'backend/src/llm-apis/vercel-ai-sdk/ai-sdk'
import { geminiModels } from 'common/constants'
import { generateCompactId } from 'common/util/string'
import { EvalRunLog, JudgingAnalysisSchema } from './types'

export function judgeEvalRun(evalRun: EvalRunLog) {
  // If there was an error, give minimum scores
  if (evalRun.error) {
    return {
      metrics: {
        completionScore: 0,
        efficiencyScore: 0,
        codeQualityScore: 0,
        overallScore: 0,
      },
      analysis: `Run failed with error: ${evalRun.error}`,
      strengths: [],
      weaknesses: ['Run failed with error'],
    }
  }

  // Format the evaluation data for analysis
  const analysisPrompt = `You are an expert software engineer tasked with analyzing and scoring the code quality of changes made by an AI coding assistant (Codebuff). Please analyze the following interaction trace and provide detailed scoring and analysis, focusing on how Codebuff responded to the Agent's prompts.

SPECIFICATION:
${evalRun.eval_commit.spec}

INTERACTION TRACE:
${evalRun.interactions
  .map(
    (i, idx) => `
Interaction ${idx + 1}:
Agent Prompt: ${i.prompt}
Codebuff Input: ${i.codebuff_input}
Codebuff Output: ${i.codebuff_output}
Agent Decision: ${i.agent_decision}
Agent Reasoning: ${i.agent_reasoning}
`
  )
  .join('\n')}

Final Status: ${evalRun.final_status}

Please analyze the implementation attempt and provide:
1. A detailed analysis of the implementation attempt
2. Key strengths and weaknesses of the implementation
3. Numerical scores (0-10):
   - Completion: How completely and correctly was the spec implemented?
   - Efficiency: How efficiently did Codebuff respond to the Agent's prompts? Speed is important!
   - Code Quality: How well-structured, maintainable and idiomatic is the code?
   - Overall: Combined assessment of the implementation quality

Focus on:
- Correctness and completeness of implementation
- Quality of the code produced
- Minimal changes: it's better to change as little code as possible to accomplish what the agent prompted
- Speed and efficiency: did Codebuff make unnecessary changes or take unnecessary steps?

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
