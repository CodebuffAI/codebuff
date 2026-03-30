# Existing Implementation Validation Pattern

When you discover existing code that appears to implement the requested functionality, validate three things: location correctness, functionality, and clear communication to the user.

## The Problem

Agents often find existing implementations and immediately conclude the task is done without:
- Verifying the implementation is in the correct location/context
- Testing that it actually works as expected
- Clearly communicating the task status to the user

This leads to:
- Missing implementations in the wrong location (main app vs specific sub-app)
- Assuming code works without verification
- Silent completion that leaves users uncertain

## The Three-Step Validation Process

### 1. Location Validation

Even if the functionality exists somewhere in the codebase, verify it's in the RIGHT place:

```bash
# Task: "Add redirects to freebuff/web/next.config.mjs"
# Found: Redirects in web/next.config.mjs
# Problem: Wrong location - freebuff/web is a separate app
```

**Check:**
- Is this the correct file path mentioned in the task?
- Is this the right application/service (monorepo apps are separate)
- Does the implementation serve the intended use case?

### 2. Functionality Validation

Don't assume existing code works. Test the actual behavior:

```bash
# For Next.js redirects
curl -I http://localhost:PORT/b/test123
# Should return 307/308 with correct Location header

# For API endpoints
curl http://localhost:PORT/api/endpoint
# Should return expected response

# For features
# Test the actual user-facing behavior
```

**Verify:**
- The implementation is active (not just configured)
- It handles the exact patterns requested
- Edge cases work (query parameters, special characters)

### 3. Clear Communication

Always explicitly tell the user what you found and what the status is:

**✅ When implementation exists and works in the right place:**
```
I found the redirect configuration in freebuff/web/next.config.mjs:

[show the code]

Testing confirms it works correctly:
$ curl -I http://localhost:3001/b/test123
HTTP/1.1 307 Temporary Redirect
Location: https://go.trybeluga.ai/test123

The feature is already implemented and functional. No changes needed.
```

**✅ When implementation exists but in wrong location:**
```
I found redirect configuration in the main web/next.config.mjs, but the task requires it in freebuff/web/next.config.mjs (separate app).

Adding the redirect to freebuff/web/next.config.mjs:

[show the changes]

This will enable the redirect specifically for the freebuff web app.
```

**✅ When implementation doesn't exist:**
```
I need to add the redirect configuration to freebuff/web/next.config.mjs:

[show the changes]

This will redirect /b/:hash to https://go.trybeluga.ai/:hash as requested.
```

## Context-Specific Validation

### Monorepo Applications

In monorepos, similar functionality may exist in multiple apps:
- `web/` - main application
- `freebuff/web/` - separate free tier app
- Each has its own `next.config.mjs`, `package.json`, etc.

**Always check the specific path mentioned in the task.**

### Configuration vs Runtime

Configuration existing ≠ feature working:
- **Next.js redirects:** Must be in active config AND server restarted
- **API routes:** Must be in correct location AND export right methods
- **Environment variables:** Must be set in runtime environment

### Test Coverage

If tests exist, use them as validation:
```typescript
// If you find tests like this:
test('redirects to go.trybeluga.ai with the hash', async ({ request }) => {
  const response = await request.get('/b/test123', { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  expect(response.headers()['location']).toBe('https://go.trybeluga.ai/test123')
})

// Run them to verify functionality
bun test path/to/redirect.test.ts
```

## Anti-Patterns to Avoid

❌ **Silent assumption:**
```
// Found redirect in web/next.config.mjs, task must be done
// (Without checking if it's the right location or communicating status)
```

❌ **Location confusion:**
```
// Task asks for freebuff/web/next.config.mjs
// Found in web/next.config.mjs
// Assumed they're the same thing
```

❌ **No status communication:**
```
// Making no changes without explaining why
// User left wondering if their request was handled
```

## Key Principle

**Existing code is only a solution if it's in the right place, works correctly, and serves the intended use case.** Always validate all three before claiming task completion.