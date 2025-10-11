# git-evals2

A simplified evaluation system for comparing Codebuff agents on git commit tasks.

## Overview

git-evals2 is a streamlined rewrite of the original git-evals system, inspired by the subagents evals (eval-planner and test-repo-utils). It focuses on simplicity and ease of use while maintaining the core functionality of agent evaluation.

## Key Simplifications

Compared to the original git-evals:

- **No child processes**: Runs everything in-process with async/await
- **No prompting agent**: Single-shot execution - agent gets the spec once and runs until done
- **Codebuff agents only**: Uses the SDK client exclusively (no Claude runner)
- **No trace in judging**: Judge only sees final file changes vs ground truth (not agent execution steps)
- **Function-based API**: Simple exported function instead of CLI with complex process management
- **Minimal metadata**: Only tracks essential metrics (diff, duration, cost, optional error)

## Usage

```typescript
import { runGitEvals2 } from './evals/git-evals2/run-git-evals2'

const results = await runGitEvals2({
  evalDataPath: 'evals/git-evals/eval-codebuff2.json',
  agents: ['base', 'base-lite'],
  outputPath: 'evals/git-evals2/results.json',
  limit: 5,
  onProgress: (event) => {
    if (event.type === 'agent_complete') {
      console.log(`${event.agent} completed with score ${event.score}`)
    }
  },
})

console.log('Average scores:', {
  base: results.agents.get('base')?.averageScore,
  'base-lite': results.agents.get('base-lite')?.averageScore,
})
```

## API

### `runGitEvals2(options: GitEvals2Options): Promise<GitEvals2Result>`

#### Options

- `evalDataPath` (string): Path to eval JSON file with commits
- `agents` (string[]): Array of agent IDs to compare (e.g., ['base', 'base-lite'])
- `outputPath?` (string): Optional path to write results JSON
- `limit?` (number): Optional max number of commits to evaluate
- `onProgress?` (callback): Optional progress event handler
- `client?` (CodebuffClient): Optional SDK client override (useful for testing)

#### Result

```typescript
interface GitEvals2Result {
  agents: Map<string, AgentEvalResults>
  timestamp: string
  totalDuration: number
}

interface AgentEvalResults {
  agentId: string
  runs: EvalRun[]
  averageScore: number
  averageCost: number
  averageDuration: number
}

interface EvalRun {
  commitSha: string
  spec: string
  diff: string
  judgeScore: number
  judgeFeedback: string
  cost: number
  durationMs: number
  error?: string
}
```

## How It Differs

### Architecture

- **Original**: Fork child processes for each eval, complex IPC communication
- **git-evals2**: Simple async functions with Promise.all for parallelism

### Execution

- **Original**: Multi-turn conversations with prompting agent deciding continue/complete/halt
- **git-evals2**: Single-shot - agent gets spec and runs until done or timeout

### Judging

- **Original**: Judge sees spec + agent trace + final diff, 3 judges with median selection
- **git-evals2**: Judge only sees spec + final diff (no trace), single judge call

### State Management

- **Original**: Complex SessionState threading, manual state updates
- **git-evals2**: SDK handles state internally, minimal metadata tracking

### Error Handling

- **Original**: Process-level handlers, signal management, cleanup logic
- **git-evals2**: Standard try-catch, continues on errors, records them in results

## Module Structure

- `run-git-evals2.ts`: Main orchestration function
- `agent-runner.ts`: Executes single agent on a commit
- `judge.ts`: Judges file changes without trace
- `types.ts`: Type definitions
- `example.ts`: Example usage

## Benefits

- **Simpler codebase**: ~90% less code than original system
- **Faster execution**: Less overhead from process management
- **Easier debugging**: Everything in-process with standard async/await
- **More maintainable**: Clear separation of concerns, modular design
- **Still powerful**: Maintains core evaluation functionality
