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
        reasoningScore: 0,
        overallScore: 0,
      },
      analysis: `Run failed with error: ${evalRun.error}`,
      strengths: [],
      weaknesses: ['Run failed with error'],
    }
  }

  // Format the evaluation data for analysis
  const analysisPrompt = `You are an expert software engineer tasked with analyzing and scoring an AI coding application's performance (Codebuff) on how it responded to the Agent. Please analyze the following interaction trace and provide detailed scoring and analysis, focusing on how Codebuff responded to the Agent's prompts.

SPECIFICATION:
${evalRun.eval_commit.spec}

INTERACTION TRACE:
${evalRun.interactions
  .map(
    (int, i) => `
Interaction ${i + 1}:
Agent Prompt: ${int.prompt}
Codebuff Input: ${int.codebuff_input}
Codebuff Output: ${int.codebuff_output}
Agent Decision: ${int.agent_decision}
Agent Reasoning: ${int.agent_reasoning}
`
  )
  .join('\n')}

Final Status: ${evalRun.final_status}

Please analyze the implementation attempt and provide:
1. Numerical scores (0-10):
   - Completion: How completely and correctly was the spec implemented?
   - Efficiency: How efficiently was it done (fewer interactions is better)?
   - Reasoning: How well did the agent reason about the implementation?
   - Overall: Combined assessment of the implementation quality

2. A detailed analysis of the implementation attempt

3. Key strengths and weaknesses of the implementation approach

Focus on:
- Correctness and completeness of implementation
- Quality of the code produced
- Efficiency of the implementation process
- Quality of reasoning and decision making
- Appropriate use of available tools and context

Provide your response in a structured format with metrics, analysis, and lists of strengths and weaknesses.`

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
