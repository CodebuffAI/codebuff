# Task Type Identification: Implementation vs Documentation

When given a task, correctly identify whether you're being asked to IMPLEMENT functionality or CREATE documentation. Don't assume a task is about documentation just because you found existing code.

## The Problem

Agents often misclassify implementation tasks as documentation tasks when they discover existing code that seems to match the requirements. This leads to:
- Creating unnecessary documentation instead of implementing features
- Claiming tasks are "already complete" without proper validation
- Ignoring the actual user need (working functionality)

## Task Classification Rules

### Implementation Tasks (require code changes)

Keywords that indicate implementation work:
- "Add redirects for..."
- "Implement feature X"
- "Create endpoint that..."
- "Make it so that when..."
- "Fix the bug where..."
- "Update the config to..."

**Action required:** Write/modify code, test functionality, verify it works.

### Documentation Tasks (require writing docs)

Keywords that indicate documentation work:
- "Document how to..."
- "Write a guide for..."
- "Create documentation explaining..."
- "Add README section about..."
- "Explain the architecture of..."

**Action required:** Write markdown/text files, create examples, explain concepts.

## When You Find Existing Code

If you discover code that appears to implement the requested functionality:

### 1. Verify It Actually Works

```bash
# For Next.js redirects, test the actual redirect
curl -I http://localhost:3000/b/test123
# Should return 307/308 with Location header

# For API endpoints, test the endpoint
curl http://localhost:3000/api/endpoint
# Should return expected response

# For features, test the user flow
# Navigate to the feature and verify it behaves as expected
```

### 2. Check Configuration vs Runtime

Just because code exists doesn't mean it's active:
- **Next.js redirects:** Must be in `next.config.mjs` redirects() function AND server must be restarted
- **API routes:** File must exist in correct location AND export correct HTTP methods
- **Features:** Code must be imported/called from the right places

### 3. Validate Against Requirements

Even if code exists, check if it matches the exact requirements:
- **Correct URL pattern:** `/b/:hash` vs `/b/:id` vs `/buffer/:hash`
- **Correct destination:** `https://go.trybeluga.ai/:hash` vs other domains
- **Correct behavior:** temporary vs permanent redirects, query parameter handling

## Response Patterns

### ✅ When Implementation Already Works

```
I found the redirect configuration in next.config.mjs and tested it:

[show the existing code]

Testing confirms it works:
$ curl -I http://localhost:3000/b/test123
HTTP/1.1 307 Temporary Redirect
Location: https://go.trybeluga.ai/test123

The feature is already implemented and functional. No changes needed.
```

### ✅ When Implementation Exists But Doesn't Work

```
I found redirect configuration in next.config.mjs, but testing shows it's not working:

[show the existing code]

Testing reveals the issue:
$ curl -I http://localhost:3000/b/test123
HTTP/1.1 404 Not Found

The configuration looks correct but the server needs to be restarted. After restart:
[show working test results]

The feature now works correctly.
```

### ✅ When Implementation Is Missing

```
I need to add the redirect configuration to next.config.mjs:

[show the changes being made]

This will redirect /b/:hash to https://go.trybeluga.ai/:hash as requested.
```

## Anti-Patterns to Avoid

❌ **Assuming task completion without testing:**
```
"The redirect is already implemented in next.config.mjs. No changes needed."
// Without actually testing if it works
```

❌ **Creating documentation for implementation tasks:**
```
// Task: "Add redirects for short URLs"
// WRONG: Creating docs/patterns/redirect-patterns.md
// RIGHT: Modifying next.config.mjs
```

❌ **Confusing configuration with functionality:**
```
// Code exists in config file ≠ feature works
// Must test the actual user-facing behavior
```

## Testing Implementation Tasks

For common implementation types:

**Web redirects:**
```bash
curl -I http://localhost:PORT/path
# Check status code (307/308) and Location header
```

**API endpoints:**
```bash
curl http://localhost:PORT/api/endpoint
# Check response status and body
```

**UI features:**
```bash
# Start dev server and manually test in browser
# Or run existing test suite
bun test path/to/feature.test.ts
```

## Key Principle

**Implementation tasks require working code, not documentation about code.** When you find existing code, your job is to verify it works and fix it if it doesn't, not to document how it should work.