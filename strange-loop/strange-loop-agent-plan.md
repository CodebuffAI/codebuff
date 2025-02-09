# Strange Loop Agent Planning Document

## Overview

Building a self-modifying agent that:
- Maintains its own context and goals in files
- Uses O3-mini model for reasoning
- Can modify its own prompt/context for next iterations
- Has tools for file I/O and context manipulation
- Runs in a continuous loop with progress tracking

## Core Components

### 1. Agent Context Management

- **Context File**: Stores the agent's current context and prompt
  - Initial prompt loaded from file
  - Can be modified by agent during execution
  - Contains hierarchy of goals and rules
  - Tracks progress and state

- **Context Modification Tools**:
  - Append string to context
  - Search and replace within context
  - Read current context
  - Tools implemented as OpenAI function calls

### 2. File System Tools

- **Read Files**:
  - Input: List of relative file paths
  - Output: Map of file contents or null if not found
  - Restricted to project directory

- **Write Files**:
  - Overwrite entire file
  - Append to end of file
  - Search/replace within file
  - Safety checks for path validation

### 3. Goal Hierarchy

1. **Foundation Rules** (Immutable):
   - Safety constraints (no modifications outside directory)
   - Ethical behavior guidelines
   - Resource usage limits

2. **Overall Goal**:
   - Set by user at initialization
   - Persists across iterations
   - Example: "Develop project X"

3. **Intermediate Goals**:
   - Set by agent
   - Break down overall goal
   - Track progress
   - Adjustable based on feedback

4. **Short-term Goals**:
   - Specific tasks for current iteration
   - Clear success criteria
   - Limited scope

### 4. Loop Control Flow

1. Load context and goals from file
2. Parse current state and progress
3. Select next action based on goals
4. Execute action via tools
5. Update context with results
6. Evaluate progress
7. Handle recovery if stuck
8. Repeat

### 5. Recovery Strategies

1. **Stuck Detection**:
   - No progress after N iterations
   - Circular reasoning patterns
   - Failed actions above threshold

2. **Recovery Actions**:
   - Undo recent context changes
   - Remove problematic prompt sections
   - Fall back to simpler subgoals
   - Request user intervention

3. **Context Cleanup**:
   - Periodic pruning of irrelevant information
   - Consolidation of related goals
   - Remove completed tasks

## Implementation Plan

### Phase 1: Basic Loop & Testing

1. **Simple Test Framework**:
   - Create basic agent with minimal context
   - Single clear goal (e.g., "Create a file with 'Hello World'")
   - Success/failure detection
   - Logging for debugging

2. **Core Tools Implementation**:
   - File read/write
   - Basic context modifications
   - Safety validations

3. **Initial Testing**:
   - Verify loop execution
   - Test tool functionality
   - Confirm context persistence

### Phase 2: Goal Management

1. **Goal Hierarchy Implementation**:
   - Context structure for multiple goal levels
   - Goal progress tracking
   - State persistence

2. **Goal Setting Logic**:
   - Breaking down large goals
   - Progress evaluation
   - Success criteria

3. **Testing**:
   - Multi-step goal achievement
   - Goal breakdown accuracy
   - Progress tracking

### Phase 3: Recovery & Robustness

1. **Stuck Detection**:
   - Implement detection mechanisms
   - Add logging and metrics
   - Test with intentionally problematic goals

2. **Recovery Implementation**:
   - Context rollback functionality
   - Cleanup strategies
   - User interaction hooks

3. **Testing**:
   - Recovery from common failure modes
   - Context cleanup effectiveness
   - Long-running stability

### Phase 4: Advanced Features

1. **Enhanced Context Management**:
   - Better search/replace strategies
   - Context summarization
   - Memory management

2. **Improved Goal Handling**:
   - Dynamic priority adjustment
   - Parallel goal processing
   - Better progress metrics

3. **Testing**:
   - Complex multi-goal scenarios
   - Long-term goal maintenance
   - Resource efficiency

## Initial Prompt Structure

```
# Agent Core Directives

## Foundational Rules
1. Never modify files outside designated directory
2. Preserve system stability and security
3. Use resources efficiently
4. Maintain clear progress tracking

## Context Management
- Current overall goal: {user_provided_goal}
- Active intermediate goals: []
- Current short-term goals: []
- Progress metrics: {}
- Last actions: []

## Decision Making Process
1. Evaluate current state
2. Check goal hierarchy
3. Select next action
4. Execute and verify
5. Update progress
6. Plan next iteration

## Recovery Protocol
- If stuck, evaluate cause
- Consider goal simplification
- Clean up context if needed
- Request help if necessary
```

## Testing Strategy

### 1. Basic Functionality Tests
- File operations
- Context modifications
- Goal persistence
- Loop execution

### 2. Goal Management Tests
- Goal breakdown
- Progress tracking
- Success detection
- State persistence

### 3. Recovery Tests
- Stuck detection
- Context cleanup
- Error handling
- Resource management

### 4. Integration Tests
- End-to-end goal completion
- Long-running stability
- Resource efficiency
- Error recovery

## Next Steps

1. Set up basic project structure
2. Implement core file operations
3. Create simple test framework
4. Build basic loop with O3-mini
5. Test with simple goals
6. Iterate based on results

## Open Questions

1. How to balance context size vs. memory needs?
2. What metrics best indicate being stuck?
3. How to handle conflicting goals?
4. When to trigger context cleanup?
5. How to optimize O3-mini prompt structure?
