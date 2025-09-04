import { analyzeTestRequirements } from '../../definitions/tool/analyze-test-requirements'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleAnalyzeTestRequirements = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'analyze_test_requirements'>
  state: any
}): {
  result: Promise<CodebuffToolOutput<'analyze_test_requirements'>>
  state: any
} => {
  const { previousToolCallFinished, toolCall } = params

  return {
    result: (async () => {
      await previousToolCallFinished
      
      try {
        // Mock project context - in real implementation this would come from the session
        const projectContext = {
          packageJson: {
            dependencies: {},
            devDependencies: {},
            scripts: {}
          }
        }
        
        const result = await analyzeTestRequirements(toolCall.input, projectContext)
        
        const criticalCount = result.requirements.filter(r => r.priority === 'critical').length
        const message = criticalCount > 0 
          ? `Found ${result.requirements.length} test requirements (${criticalCount} critical). Framework: ${result.framework.framework}`
          : `Found ${result.requirements.length} test requirements. Framework: ${result.framework.framework}`
        
        return [
          {
            type: 'json',
            value: {
              ...result,
              message,
            },
          },
        ]
      } catch (error) {
        return [
          {
            type: 'json',
            value: {
              requirements: [],
              framework: {
                framework: 'unknown' as const,
                configFiles: [],
                testPatterns: [],
                runCommand: 'npm test',
                setupFiles: [],
              },
              existingPatterns: {
                mockPatterns: [],
                assertionStyles: [],
                testStructure: 'unknown',
              },
              recommendations: [],
              criticalGaps: [`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
              message: `Test analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          },
        ]
      }
    })(),
    state: params.state,
  }
}) satisfies CodebuffToolHandlerFunction<'analyze_test_requirements'>
