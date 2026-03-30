# Implementation Validation Pattern

When you find existing code that appears to implement the requested functionality, always validate that it actually works before claiming the task is complete.

## The Problem

Agents often discover existing implementations and immediately conclude the task is done without testing functionality. This leads to:
- Claiming features work when they don't
- Missing broken configurations that look correct in code
- Failing to communicate actual task status clearly
- Users left uncertain whether their request was fulfilled

## The Validation Process

### 1. Find the Implementation

When you discover code that seems to match the requirements:

```bash
# Found redirect in next.config.mjs
{
  source: '/b/:hash',
  destination: 'https://go.trybeluga.ai/:hash',
  permanent: false,
}
```

### 2. Test the Actual Functionality

Don't assume code works just because it exists. Test the user-facing behavior:

```bash
# For Next.js redirects - test the actual redirect
curl -I http://localhost:3000/b/test123
# Should return 307/308 with Location header

# For API endpoints - test the endpoint
curl http://localhost:3000/api/endpoint
# Should return expected response

# For UI features - verify the user flow works
```

### 3. Check Runtime vs Configuration

Code existing ≠ code working. Verify the implementation is active:

- **Next.js redirects**: Must be in active config AND server restarted
- **API routes**: File must exist in correct location AND export right methods
- **Features**: Code must be imported/called from the right places
- **Environment**: Required env vars, database state, etc.

### 4. Validate Against Exact Requirements

Even working code might not match the specific requirements:

- **URL patterns**: `/b/:hash` vs `/b/:id` vs `/buffer/:hash`
- **Destinations**: `https://go.trybeluga.ai/:hash` vs other domains
- **Behavior**: temporary vs permanent redirects, query handling

## Response Patterns

### ✅ When Implementation Works

```
I found the redirect configuration in next.config.mjs and verified it works:

[show the existing code]

Testing confirms functionality:
$ curl -I http://localhost:3000/b/test123
HTTP/1.1 307 Temporary Redirect
Location: https://go.trybeluga.ai/test123

The feature is already implemented and working correctly.
```

### ✅ When Implementation Exists But Broken

```
I found redirect configuration in next.config.mjs, but testing shows it's not working:

[show the existing code]

Testing reveals the issue:
$ curl -I http://localhost:3000/b/test123
HTTP/1.1 404 Not Found

The server needs to be restarted for redirects to take effect.
After restart, the redirect works correctly.
```

### ✅ When Implementation Is Missing

```
I need to add the redirect configuration to next.config.mjs:

[show the changes being made]

This will redirect /b/:hash to https://go.trybeluga.ai/:hash as requested.
```

## Testing Strategies by Feature Type

### Web Redirects
```bash
curl -I http://localhost:PORT/path
# Check status code (307/308) and Location header
```

### API Endpoints
```bash
curl http://localhost:PORT/api/endpoint
# Check response status and body
```

### Database Features
```bash
# Check if tables/columns exist
# Verify data can be inserted/queried
# Test constraints and relationships
```

### UI Components
```bash
# Start dev server and manually test
# Or run existing test suite
bun test path/to/feature.test.ts
```

## Use Existing Tests When Available

If tests exist for the feature:

1. **Read the test file** to understand expected behavior
2. **Run the tests** to verify current implementation
3. **Report test results** as evidence of functionality

Example:
```typescript
test('redirects to go.trybeluga.ai with the hash', async ({ request }) => {
  const response = await request.get('/b/test123', { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  expect(response.headers()['location']).toBe('https://go.trybeluga.ai/test123')
})
```

If these tests exist and pass, the feature is confirmed working.

## Anti-Patterns to Avoid

❌ **Assuming functionality without testing**:
```
"The redirect is already implemented in next.config.mjs. No changes needed."
// Without actually verifying it works
```

❌ **Confusing configuration with functionality**:
```
// Code exists in config file ≠ feature works at runtime
```

❌ **Silent completion without communication**:
```
// Making no changes and not explaining why
// Leaving user unsure if their request was handled
```

## Key Principle

**Code that looks right might not work right.** Always test the actual user-facing behavior before claiming a feature is complete. When in doubt, verify through testing rather than code inspection alone.