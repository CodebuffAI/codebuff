# Codelayer

Codelayer is a collection of specialized AI agents designed to enhance software development workflows through intelligent codebase analysis, research, and navigation. Built with inspiration from [HumanLayer](https://github.com/humanlayer/humanlayer)'s human-in-the-loop philosophy, Codelayer provides targeted assistance for understanding and working with complex codebases.

## Table of contents

- [Getting Started](#getting-started)
- [Why Codelayer?](#why-codelayer)
- [Available Agents](#available-agents)
- [Usage Examples](#usage-examples)
- [Advanced Usage](#advanced-usage)
- [Contributing](#contributing)

## Getting Started

```bash
# Start with the base coordinator agent
codebuff --agent codelayer-base

# Or use a specialized agent directly
codebuff --agent codebase-locator
codebuff --agent codebase-analyzer
```

## Why Codelayer?

Modern software development involves navigating increasingly complex codebases with intricate dependencies, patterns, and architectures. While generic AI assistants can provide general programming help, they often lack the specialized focus needed for deep codebase understanding.

Codelayer addresses this by providing a suite of specialized agents, each optimized for specific development tasks:

- **Codebase Navigation**: Rapidly locate files, components, and implementations across large projects
- **Architecture Analysis**: Understand data flow, execution paths, and system interactions
- **Pattern Discovery**: Find similar implementations and usage examples within your codebase
- **Research Integration**: Combine internal documentation with external best practices

### Connection to HumanLayer

Like [HumanLayer](https://github.com/humanlayer/humanlayer), Codelayer emphasizes **human-in-the-loop workflows**. Rather than making autonomous changes, these agents focus on providing comprehensive analysis and insights that enhance human decision-making. This approach ensures:

- **Transparency**: Clear explanations of findings and methodologies
- **Verification**: Human oversight of all recommendations and analysis
- **Augmentation**: Tools that enhance rather than replace developer expertise
- **Safety**: No automated modifications without explicit human approval

## Available Agents

### `codelayer-base`
Central coordinator that routes requests to appropriate specialized agents based on task requirements.

### `codebase-locator`
Locates files, directories, and components using natural language queries. Equivalent to an intelligent search tool that understands development context.

### `codebase-analyzer`
Provides detailed analysis of implementations, including execution flow, data transformations, and architectural patterns.

### `codebase-pattern-finder`
Identifies similar implementations and usage patterns within the codebase, useful for maintaining consistency and understanding conventions.

### `thoughts-locator`
Searches project documentation, notes, and thoughts directories for relevant context and historical decisions.

### `thoughts-analyzer`
Extracts insights from documentation and notes, focusing on architectural decisions and implementation constraints.

### `web-search-researcher`
Conducts comprehensive web research for best practices, documentation, and current industry approaches relevant to development tasks.

## Usage Examples

### Codebase Navigation
```bash
codebuff --agent codebase-locator
# Query: "Find all files related to user authentication"
```

### Implementation Analysis
```bash
codebuff --agent codebase-analyzer
# Query: "How does the webhook processing system work?"
```

### Pattern Research
```bash
codebuff --agent codebase-pattern-finder
# Query: "Show me how error handling is implemented across the codebase"
```

### External Research
```bash
codebuff --agent web-search-researcher
# Query: "Best practices for API rate limiting in Node.js applications"
```

## Advanced Usage

### Sequential Agent Workflows

For complex analysis tasks, agents can be chained together:

```bash
# 1. Locate relevant files
codebuff --agent codebase-locator
"Find authentication middleware files"

# 2. Analyze implementation details
codebuff --agent codebase-analyzer
"Analyze JWT token validation in auth/middleware.js"

# 3. Research best practices
codebuff --agent web-search-researcher
"Current JWT security best practices 2024"
```

### Coordinated Analysis

The base agent can coordinate multiple specialized agents for comprehensive analysis:

```bash
codebuff --agent codelayer-base
"Provide a complete analysis of the payment processing system, including implementation details, test coverage, and current best practices"
```

## Contributing

Contributions to Codelayer are welcome. When adding new agents:

### Guidelines

1. Use the `codelayer` publisher namespace
2. Import shared types from `../types/agent-definition`
3. Follow established naming conventions
4. Update this README with agent descriptions
5. Focus on specialized functionality rather than general-purpose capabilities

### Design Principles

- **Specialization**: Each agent should excel at a specific domain
- **Transparency**: Provide clear explanations of analysis methods
- **Consistency**: Maintain structured, predictable output formats
- **Collaboration**: Design agents to work effectively together
- **Human-centric**: Augment rather than replace human decision-making

## License

Codelayer agents are part of the Codebuff project and follow the same licensing terms.
