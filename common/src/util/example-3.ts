// @ts-nocheck
import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'example-3',
  displayName: 'Doc the Documentation Writer (Level 3)',
  model: 'google/gemini-2.5-pro',
  
  toolNames: [
    'read_files',
    'write_file',
    'str_replace',
    'code_search',
    'run_terminal_command',
    'spawn_agents',
    'web_search',
    'read_docs',
    'create_plan',
    'add_subgoal',
    'update_subgoal',
    'think_deeply',
    'set_output',
    'end_turn'
  ],
  
  displayName: 'Doc the Documentation Writer (Example 3)',
  subagents: ['file-explorer', 'researcher', 'thinker'],
  
  includeMessageHistory: true,
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Project, codebase, or specific components you want comprehensive documentation for'
    },
    params: {
      type: 'object',
      properties: {
        docType: {
          type: 'string',
          description: 'Type of documentation: api, user-guide, technical, or comprehensive'
        },
        audience: {
          type: 'string',
          description: 'Target audience: developers, end-users, or maintainers'
        },
        format: {
          type: 'string',
          description: 'Output format: markdown, rst, or html'
        },
        includeExamples: {
          type: 'boolean',
          description: 'Whether to include code examples and tutorials'
        },
        generateDiagrams: {
          type: 'boolean',
          description: 'Whether to generate architecture diagrams'
        }
      }
    }
  },
  
  outputMode: 'json',
  outputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      documentsCreated: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            type: { type: 'string' },
            sections: { type: 'array', items: { type: 'string' } },
            wordCount: { type: 'number' }
          }
        }
      },
      architectureInsights: {
        type: 'array',
        items: { type: 'string' }
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  },
  
  parentPrompt: 'Creates comprehensive, professional documentation for codebases and projects. Advanced complexity with research, planning, and multi-format output.',
  
  systemPrompt: `# Doc the Documentation Writer (Level 3)

You are a senior technical writer and documentation architect who creates world-class documentation. You excel at:

- **Information Architecture**: Organizing complex information logically
- **Audience Analysis**: Tailoring content to specific user needs
- **Technical Communication**: Explaining complex concepts clearly
- **Research & Analysis**: Understanding codebases deeply
- **Multi-format Publishing**: Creating docs in various formats

## Documentation Philosophy
- Documentation is a product, not a byproduct
- Users' mental models drive information architecture
- Examples and tutorials are as important as reference material
- Consistency in style, tone, and structure builds trust
- Documentation should evolve with the codebase

## Your Expertise
- **API Documentation**: OpenAPI specs, endpoint docs, SDKs
- **User Guides**: Tutorials, how-tos, troubleshooting
- **Technical Docs**: Architecture, deployment, maintenance
- **Code Documentation**: Inline comments, README files
- **Visual Documentation**: Diagrams, flowcharts, screenshots

## Advanced Capabilities
- Research existing documentation patterns and best practices
- Analyze codebase architecture and dependencies
- Create comprehensive documentation plans
- Generate multiple documentation formats
- Integrate with existing documentation systems`,
  
  instructionsPrompt: `Create comprehensive documentation for the specified project or codebase. Your systematic approach:

1. **Research & Planning Phase**
   - Explore the codebase architecture
   - Research documentation best practices
   - Create a detailed documentation plan
   - Identify target audiences and their needs

2. **Analysis Phase**
   - Deep dive into code structure and patterns
   - Understand dependencies and integrations
   - Identify key concepts and workflows
   - Map user journeys and use cases

3. **Content Creation Phase**
   - Write clear, comprehensive documentation
   - Include practical examples and tutorials
   - Create visual aids and diagrams
   - Ensure consistency across all documents

4. **Quality Assurance Phase**
   - Review for accuracy and completeness
   - Test examples and code snippets
   - Validate against user needs
   - Optimize for discoverability

Focus on creating documentation that serves as both reference and learning material.`,
  
  handleSteps: function* ({ agentState, prompt, params }) {
    // Step 1: Create comprehensive plan
    yield {
      toolName: 'add_subgoal',
      args: {
        id: '1',
        objective: 'Research and plan comprehensive documentation strategy',
        status: 'IN_PROGRESS'
      }
    }
    
    // Step 2: Research best practices
    yield {
      toolName: 'spawn_agents',
      args: {
        agents: [{
          agent_type: 'researcher',
          prompt: `Research current best practices for ${params?.docType || 'technical'} documentation, focusing on ${params?.audience || 'developers'} audience. Include modern documentation tools and formats.`
        }]
      }
    }
    
    // Step 3: Explore codebase comprehensively
    yield {
      toolName: 'spawn_agents',
      args: {
        agents: [{
          agent_type: 'file-explorer',
          prompt: `Comprehensively explore the codebase for documentation: ${prompt}`,
          params: {
            prompts: [
              'Main application architecture and entry points',
              'API endpoints and data models',
              'Configuration and deployment files',
              'Existing documentation and README files'
            ]
          }
        }]
      }
    }
    
    // Step 4: Deep thinking about documentation strategy
    yield {
      toolName: 'spawn_agents',
      args: {
        agents: [{
          agent_type: 'thinker',
          prompt: `Analyze the codebase structure and research findings to develop a comprehensive documentation strategy. Consider information architecture, user journeys, and content organization for ${params?.audience || 'developers'}.`
        }]
      }
    }
    
    // Step 5: Create detailed plan
    yield {
      toolName: 'create_plan',
      args: {
        path: 'documentation-plan.md',
        plan: 'Based on research and codebase analysis, create a detailed plan for comprehensive documentation including structure, content types, examples, and delivery format.'
      }
    }
    
    // Step 6: Update subgoal and continue with implementation
    yield {
      toolName: 'update_subgoal',
      args: {
        id: '1',
        status: 'COMPLETE',
        log: 'Completed research and planning phase'
      }
    }
    
    // Step 7: Execute documentation creation
    yield {
      toolName: 'add_subgoal',
      args: {
        id: '2',
        objective: 'Create comprehensive documentation based on plan',
        status: 'IN_PROGRESS'
      }
    }
    
    // Step 8: Let the model continue with implementation
    yield 'STEP_ALL'
  }
}

export default config