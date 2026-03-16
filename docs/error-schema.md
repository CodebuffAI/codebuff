# Error Schema: Server Responses & Client Handling

This document describes the error responses the Codebuff server sends, how the AI SDK transforms them, and how errors are ultimately displayed in the CLI.

## Server Error Responses

**Source:** `web/src/app/api/v1/chat/completions/_post.ts`

The server returns JSON error responses with an HTTP status code. There are two shapes:

### Simple errors (message only)

```json
{ "message": "<human-readable message>" }
```

Used for:

| Status | Example message |
|--------|----------------|
| 400 | `"Invalid JSON in request body"` |
| 400 | `"No runId found in request body"` |
| 401 | `"Unauthorized"` |
| 401 | `"Invalid Codebuff API key"` |
| 402 | `"Out of credits. Please add credits at https://codebuff.com/usage. Your free credits reset in 3 hours."` |

### Typed errors (error code + message)

```json
{ "error": "<machine-readable code>", "message": "<human-readable message>" }
```

Used for errors that the client needs to identify programmatically:

| Status | `error` code | Example `message` |
|--------|-------------|-------------------|
| 403 | `account_suspended` | `"Your account has been suspended due to billing issues. Please contact support@codebuff.com to resolve this."` |
| 403 | `free_mode_unavailable` | `"Free mode is not available in your country."` (Freebuff: `"Freebuff is not available in your country."`) |
| 429 | `rate_limit_exceeded` | `"Subscription weekly limit reached. Your limit resets in 2 hours. Enable 'Continue with credits' in the CLI to use a-la-carte credits."` |

### Catch-all server error

```json
{ "error": "Failed to process request" }
```

The 500 catch-all uses `error` as a human-readable string (no `message` field). This does not follow the typed error pattern above — it's a legacy format.

### Provider errors

When the upstream LLM provider (OpenRouter, Fireworks, OpenAI, etc.) returns an error, the server passes it through via the provider's `.toJSON()` format, which varies by provider.

## The AI SDK Transformation Problem

The Codebuff backend is called through the AI SDK's `OpenAICompatibleChatLanguageModel`, which treats it as a standard OpenAI-compatible endpoint. When the server returns a non-2xx response, **the AI SDK wraps it** into an `APICallError`:

```
Server returns:   HTTP 403  { "error": "free_mode_unavailable", "message": "Free mode is not available in your country." }
                      │
                      ▼
AI SDK creates:   APICallError {
                    message: "Forbidden"              ← HTTP status text (NOT the server's message)
                    statusCode: 403
                    responseBody: "{\"error\":\"free_mode_unavailable\",\"message\":\"Free mode is not available in your country.\"}"  ← original JSON as a string
                  }
```

The server's human-readable `message` and machine-readable `error` code are buried inside `responseBody` as a JSON string. The `APICallError.message` is just the HTTP status text ("Forbidden", "Payment Required", etc.).

## Client-Side Error Recovery

To recover the server's structured error details, we use `parseApiErrorResponseBody()` from `common/src/util/error.ts`:

```typescript
export function parseApiErrorResponseBody(responseBody: unknown): {
  errorCode?: string
  message?: string
}
```

This is called in two places:

### 1. Agent Runtime catch block

**File:** `packages/agent-runtime/src/run-agent-step.ts` (in `loopAgentSteps`)

This is the **primary** error handler. Most API errors are caught here because the error occurs during `runAgentStep()` → `promptAiSdkStream()` → `streamText()`.

```typescript
catch (error) {
  if (error instanceof APICallError) {
    const parsed = parseApiErrorResponseBody(error.responseBody)
    // parsed.errorCode = 'free_mode_unavailable'
    // parsed.message = 'Free mode is not available in your country.'
  }
  // ...
  return {
    output: {
      type: 'error',
      message: hasServerMessage ? errorMessage : 'Agent run error: ' + errorMessage,
      statusCode,
      error: errorCode,   // ← machine-readable code for client matching
    },
  }
}
```

### 2. SDK .catch() handler

**File:** `sdk/src/run.ts` (in `callMainPrompt().catch()`)

This is a **fallback** handler for errors that escape the agent runtime (e.g., errors during setup before the agent loop starts).

## Error Output Schema

**File:** `common/src/types/session-state.ts`

The `AgentOutputSchema` defines the Zod schema for agent output. The error variant:

```typescript
z.object({
  type: z.literal('error'),
  message: z.string(),
  statusCode: z.number().optional(),
  error: z.string().optional(),       // machine-readable error code
})
```

All three fields flow through to the CLI.

## CLI Error Handling

**Files:** `cli/src/utils/error-handling.ts`, `cli/src/hooks/helpers/send-message.ts`

The CLI checks the output for known error types:

```typescript
// Checks statusCode === 402
isOutOfCreditsError(output)       → shows OUT_OF_CREDITS_MESSAGE

// Checks statusCode === 403 && error === 'free_mode_unavailable'
isFreeModeUnavailableError(output) → shows FREE_MODE_UNAVAILABLE_MESSAGE
```

For all other errors, the raw `output.message` is displayed in the `UserErrorBanner`.

## Error Flow Diagram

```
  Server                    AI SDK                  Agent Runtime              SDK                    CLI
    │                         │                         │                       │                      │
    │  HTTP 403               │                         │                       │                      │
    │  { error, message }     │                         │                       │                      │
    │────────────────────────▶│                         │                       │                      │
    │                         │  APICallError           │                       │                      │
    │                         │  .message="Forbidden"   │                       │                      │
    │                         │  .responseBody="{...}"  │                       │                      │
    │                         │────────────────────────▶│                       │                      │
    │                         │                         │  catch (APICallError) │                      │
    │                         │                         │  parseResponseBody()  │                      │
    │                         │                         │  extract error code   │                      │
    │                         │                         │  extract message      │                      │
    │                         │                         │─────────────────────▶ │                      │
    │                         │                         │  prompt-response      │                      │
    │                         │                         │  { type: 'error',     │                      │
    │                         │                         │    statusCode: 403,   │                      │
    │                         │                         │    error: '...',      │                      │
    │                         │                         │    message: '...' }   │                      │
    │                         │                         │                       │─────────────────────▶│
    │                         │                         │                       │  handleRunCompletion  │
    │                         │                         │                       │  isFreeModeUnavail..  │
    │                         │                         │                       │  show friendly msg    │
```

## Adding a New Server Error Type

To add a new error type that the CLI can identify and handle specially:

1. **Server** (`web/src/app/api/v1/chat/completions/_post.ts`): Return a typed error:
   ```typescript
   return NextResponse.json(
     { error: 'your_error_code', message: 'User-friendly message.' },
     { status: 4xx },
   )
   ```

2. **CLI error detection** (`cli/src/utils/error-handling.ts`): Add a checker:
   ```typescript
   export const isYourError = (error: unknown): boolean => {
     if (
       error &&
       typeof error === 'object' &&
       'statusCode' in error &&
       (error as { statusCode: unknown }).statusCode === 4xx &&
       'error' in error &&
       (error as { error: unknown }).error === 'your_error_code'
     ) {
       return true
     }
     return false
   }
   ```

3. **CLI display** (`cli/src/hooks/helpers/send-message.ts`): Handle it in `handleRunCompletion`:
   ```typescript
   if (isYourError(output)) {
     updater.setError(YOUR_ERROR_MESSAGE)
     finalizeAfterError()
     return
   }
   ```

No changes needed in the agent runtime or SDK — `parseApiErrorResponseBody` automatically extracts any `error` and `message` fields from the server's response body.
