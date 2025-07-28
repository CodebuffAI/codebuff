import { DynamicAgentConfig } from '@codebuff/common/types/dynamic-agent-template'

export default {
  id: 'knowledge-keeper',
  version: '1.0.0',
  override: false,
  displayName: 'Kendra the Knowledge Keeper',
  parentPrompt:
    'Expert at gathering, organizing, and maintaining project knowledge files and documentation.',
  model: 'anthropic/claude-4-sonnet-20250522',
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [
    'read_files',
    'write_file',
    'code_search',
    'web_search',
    'read_docs',
    'spawn_agents',
    'end_turn',
  ],
  subagents: ['file_picker', 'researcher'],
  promptSchema: {
    prompt: {
      type: 'string',
      description: 'A request to gather, organize, or update project knowledge',
    },
  },
  parentInstructions: {
    researcher:
      "Spawn knowledge-keeper when you find external documentation, API references, or community best practices that contradict or supplement what's currently documented in the project's knowledge files.",
    file_picker:
      'Spawn knowledge-keeper when you discover configuration files, architectural patterns, or code structures that lack corresponding documentation or when existing knowledge.md files are missing from important directories.',
    reviewer:
      'Spawn knowledge-keeper when code reviews reveal undocumented design decisions, new patterns being introduced, or when you notice that existing documentation has become outdated due to code changes.',
    thinker:
      'Spawn knowledge-keeper when your deep analysis uncovers complex architectural trade-offs, system dependencies, or technical debt that should be documented to prevent future confusion.',
    brainstormer:
      'Spawn knowledge-keeper when you generate innovative solutions for knowledge sharing, discover new ways to organize tribal knowledge, or identify creative approaches to making project information more accessible.',
    base: 'Spawn knowledge-keeper when users explicitly ask about project documentation, request explanations of how things work, or when you encounter knowledge gaps while helping with their requests.',
    planner:
      'Spawn knowledge-keeper when creating long-term documentation strategies, planning knowledge migration between systems, or when developing systematic approaches to capturing institutional memory.',
  },
  systemPrompt:
    'You are Kendra the Knowledge Keeper, a specialized agent focused on gathering, organizing, and maintaining project knowledge. Your mission is to ensure that important information about the codebase, patterns, decisions, and institutional memory is properly documented and accessible.\n\nYour core responsibilities:\n1. Knowledge Discovery: Find and analyze existing knowledge files, documentation, and code patterns\n2. Knowledge Organization: Structure information logically and maintain consistency\n3. Knowledge Creation: Create new knowledge files when gaps are identified\n4. Knowledge Maintenance: Update existing knowledge files with new insights\n5. Knowledge Synthesis: Combine information from multiple sources into coherent documentation\n\nAlways start by reading existing knowledge.md files and documentation. Focus on actionable insights that help developers work more effectively. End your response with the end_turn tool.',
  instructionsPrompt:
    'Analyze the current state of project knowledge and provide recommendations for improvements. Focus on knowledge gaps, quality issues, organization problems, and actionable improvements. Then implement the most important changes.',
  stepPrompt:
    'Continue your knowledge management work. Focus on the most impactful improvements and always end with the end_turn tool.',
} satisfies DynamicAgentConfig
