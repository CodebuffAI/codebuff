# Task Scope Adherence Pattern

When given a specific technical task, implement ONLY what is explicitly requested. Do not add "helpful" extras, documentation, or related improvements unless specifically asked.

## The Problem

Agents often interpret tasks broadly and add related work they think would be helpful:
- Task: "Remove the wait-for command" → Agent also creates 3 new documentation files
- Task: "Fix the redirect" → Agent also refactors related code and adds tests
- Task: "Update the config" → Agent also adds validation and error handling

While well-intentioned, this scope creep can:
- Introduce unintended changes that break existing functionality
- Make code review more difficult by mixing requested changes with unrequested additions
- Violate the principle of least change in production systems
- Create maintenance burden for code the user didn't ask for

## The Solution: Strict Scope Adherence

### 1. Parse the Task Precisely

Identify the exact scope from the task description:
- "Remove the wait-for command" = delete wait-for implementation and references
- "Add a redirect" = add one specific redirect rule
- "Fix the test" = make the failing test pass

### 2. Implement Only What's Requested

**DO:**
- Remove the specific command/feature mentioned
- Update direct references to use the replacement
- Fix compilation errors caused by the removal
- Update usage examples that directly reference the removed feature

**DON'T:**
- Add new documentation files unless specifically requested
- Refactor related code "while you're at it"
- Add validation, error handling, or tests unless they're breaking
- Create helper utilities or abstractions
- Update tangentially related files

### 3. Resist the Urge to "Improve"

Common scope creep patterns to avoid:

```typescript
// Task: Remove deprecated function
// WRONG - adding documentation
const changes = [
  'Remove oldFunction()',
  'Update all references', 
  'Add migration guide',  // ❌ Not requested
  'Create best practices doc', // ❌ Not requested
  'Add usage examples' // ❌ Not requested
]

// CORRECT - minimal scope
const changes = [
  'Remove oldFunction()',
  'Update direct references to use newFunction()'
]
```

## Examples from Real Tasks

### Task: "Remove wait-for command from tmux CLI agent"

**Correct scope:**
- Remove wait-for case from bash script
- Update documentation strings to reference wait-idle instead
- Update error message examples
- Fix any compilation errors

**Scope creep (avoid):**
- Creating new documentation files about task validation
- Adding template literal escaping guides
- Creating terminal buffer management docs
- Updating AGENTS.md with new doc references

### Task: "Add redirect for /b/:hash"

**Correct scope:**
- Add one redirect rule to next.config.js
- Verify it compiles

**Scope creep (avoid):**
- Adding tests for the redirect
- Creating redirect management utilities
- Adding analytics tracking
- Documenting redirect patterns

## When Additional Work IS Appropriate

**Exception 1: Compilation/Runtime Errors**
If your minimal change breaks compilation or causes runtime errors, fix those:
```typescript
// If removing wait-for breaks template literals, fix the escaping
// If removing a function breaks imports, update the imports
```

**Exception 2: Direct Dependencies**
If the change requires updating direct references:
```typescript
// If removing wait-for, update help text that mentions it
// If renaming a function, update its direct callers
```

**Exception 3: Explicit "and" in Task**
```
"Remove wait-for command and add documentation" // Two explicit tasks
"Fix the bug and add a test" // Two explicit tasks
```

## Validation Questions

Before adding anything beyond the core task, ask:
1. **Was this explicitly requested?** If no, don't add it.
2. **Does the minimal change break without this?** If no, don't add it.
3. **Is this a direct reference that must be updated?** If no, don't add it.

## Communication Pattern

When completing a task, clearly separate what was requested vs. what you considered:

```
✅ Completed: Removed wait-for command from tmux CLI agent
- Removed wait-for case from helper script
- Updated documentation to use wait-idle
- Fixed template literal escaping issues

💭 Considered but did not implement (not requested):
- Adding comprehensive documentation about wait patterns
- Creating validation guides
- Refactoring related timing code
```

## Key Principle

**The best code change is the smallest one that accomplishes the exact goal.** Resist the urge to "improve while you're there" unless explicitly asked. Production systems value predictability and minimal change over comprehensive improvements.