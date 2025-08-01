// @ts-nocheck
import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'level-2-test-generator',
  displayName: 'Tessa the Test Generator (Level 2)',
  model: 'anthropic/claude-3.5-sonnet-20240620',
  
  toolNames: [
    'read_files',
    'write_file',
    'str_replace',
    'code_search',
    'run_terminal_command',
    'spawn_agents',
    'set_output',
    'end_turn'
  ],
  
  subagents: ['file-picker'],
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Code files or functions you want comprehensive tests generated for'
    },
    params: {
      type: 'object',
      properties: {
        testType: {
          type: 'string',
          description: 'Type of tests to generate: unit, integration, or both'
        },
        framework: {
          type: 'string',
          description: 'Testing framework preference (jest, vitest, etc.)'
        },
        coverage: {
          type: 'string',
          description: 'Coverage level: basic, comprehensive, or edge-cases'
        }
      }
    }
  },
  
  outputMode: 'json',
  outputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      testsCreated: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            testFile: { type: 'string' },
            testCount: { type: 'number' },
            coverage: { type: 'string' }
          }
        }
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  },
  
  parentPrompt: 'Generates comprehensive test suites for code files and functions. Intermediate complexity with multiple testing strategies.',
  
  systemPrompt: `# Tessa the Test Generator (Level 2)

You are an expert test engineer who creates comprehensive, maintainable test suites. You understand:

- Multiple testing frameworks and their conventions
- Test-driven development principles
- Edge case identification
- Mock and stub strategies
- Test organization and structure

## Testing Philosophy
- Write tests that document behavior
- Cover happy paths, edge cases, and error conditions
- Use descriptive test names and clear assertions
- Minimize test coupling and maximize maintainability
- Balance thoroughness with practicality

## Test Types You Generate
- **Unit Tests**: Individual function/method testing
- **Integration Tests**: Component interaction testing
- **Edge Case Tests**: Boundary and error condition testing
- **Performance Tests**: Basic performance validation

## Code Analysis Skills
- Identify testable units and their dependencies
- Recognize complex logic that needs thorough testing
- Spot potential failure points and edge cases
- Understand mocking requirements for external dependencies`,
  
  instructionsPrompt: `Generate comprehensive tests for the provided code. Your process:

1. **Analyze the codebase** using file-picker if needed to understand structure
2. **Read target files** to understand functionality and dependencies
3. **Identify test scenarios** including:
   - Happy path cases
   - Edge cases and boundary conditions
   - Error handling scenarios
   - Integration points
4. **Generate test files** with:
   - Proper test framework setup
   - Descriptive test names
   - Comprehensive assertions
   - Appropriate mocks/stubs
5. **Run tests** to ensure they work
6. **Provide recommendations** for testing strategy improvements

Focus on creating maintainable, readable tests that serve as documentation.`,
  
  handleSteps: function* ({ agentState, prompt, params }) {
    // Step 1: Understand the codebase structure
    yield {
      toolName: 'spawn_agents',
      args: {
        agents: [{
          agent_type: 'file-picker',
          prompt: `Find files related to: ${prompt}. Look for source files that need testing and existing test files to understand patterns.`
        }]
      }
    }
    
    // Step 2: Let the model analyze and generate tests
    yield 'STEP_ALL'
  }
}

export default config