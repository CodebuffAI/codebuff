# Task Completion Validation Pattern

When implementing features, always validate whether the requested functionality already exists before making changes. Many tasks may already be complete or partially implemented.

## The Validation Process

### 1. Search for Existing Implementation

Before implementing any feature, search the codebase for existing implementations:

```bash
# Search for relevant patterns
code_search "pattern related to feature"
# Check configuration files
read_files ["config-file.js", "next.config.mjs"]
```

### 2. Verify Implementation Completeness

When you find existing code, verify it matches the requirements:

- **Check the exact pattern**: Does `/b/:hash` match the requested route?
- **Verify the destination**: Does `https://go.trybeluga.ai/:hash` match the target?
- **Confirm the behavior**: Is `permanent: false` the correct redirect type?

### 3. Test the Implementation

If implementation exists, verify it works:

```bash
# Look for existing tests
code_search "test.*redirect.*b/"
# Run relevant tests if they exist
run_terminal_command "bun test path/to/redirect/tests"
```

### 4. Communicate Task Status Clearly

Always provide explicit feedback about task completion:

**✅ When feature is already implemented:**
```
The redirect for /b/:hash is already implemented in next.config.mjs:

[show the relevant code]

This configuration:
- Redirects /b/:hash to https://go.trybeluga.ai/:hash
- Uses temporary redirects (permanent: false)
- Preserves query parameters

No additional changes needed - the feature is complete!
```

**✅ When making changes:**
```
I need to add the redirect configuration to next.config.mjs:

[show the changes being made]

This will enable the requested /b/:hash → go.trybeluga.ai functionality.
```

## Common Scenarios

### Next.js Redirects

For Next.js redirect tasks, always check `next.config.mjs` first:

```javascript
// Look for existing redirects() function
async redirects() {
  return [
    {
      source: '/pattern',
      destination: 'https://target.com/pattern',
      permanent: false,
    },
  ]
}
```

### API Routes

For API endpoint tasks, check existing route files:

```bash
# Check if route already exists
list_directory "src/app/api/target-path"
read_files ["src/app/api/target-path/route.ts"]
```

### Component Features

For UI feature tasks, search for existing components:

```bash
code_search "component.*feature.*name"
glob "**/*ComponentName*"
```

## Anti-Patterns to Avoid

❌ **Silent failure**: Making no changes without explanation
❌ **Duplicate implementation**: Adding code when it already exists
❌ **Incomplete verification**: Finding partial implementation but not checking if it's complete
❌ **No status communication**: Leaving the user unsure whether the task succeeded

## Test Validation

When tests exist for the feature:

1. **Read the test file** to understand expected behavior
2. **Run the tests** to verify current implementation works
3. **Report test results** as evidence of completion

Example from redirect tests:
```typescript
test('redirects to go.trybeluga.ai with the hash', async ({ request }) => {
  const response = await request.get('/b/test123', { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  expect(response.headers()['location']).toBe('https://go.trybeluga.ai/test123')
})
```

If these tests exist and pass, the feature is confirmed working.

## Key Principle

**Always explicitly state whether a task is complete, incomplete, or already done.** Never leave the user guessing about the status of their request.