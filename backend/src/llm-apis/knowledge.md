# LLM API Fallback Mechanism

## Overview

The fallback mechanism provides resilience against provider outages by automatically switching to alternative LLM providers when the primary provider fails.

## How It Works

1. **Primary Provider**: Anthropic models (Claude) can be configured with fallback providers
2. **Fallback Chain**: When Anthropic fails, the system tries alternative providers in order:
   - Default: `['gemini', 'openai']`
   - Configurable per agent template
3. **Retry Logic**: Each provider gets multiple retry attempts (3 for primary, 2 for fallbacks)

## Configuration

In agent templates (e.g., `backend/src/templates/agents/base.ts`):

```typescript
// Enable fallback for Anthropic models
...(Object.values(claudeModels).includes(model as AnthropicModel) && {
  fallbackProviders: ['openrouter'] as FallbackProvider[],
}),
```

## Testing the Fallback

### Unit Tests
Run: `bun test anthropic-with-fallbacks.test.ts`

### Manual Testing
1. **Simulate API failure**: 
   ```bash
   ANTHROPIC_API_KEY=invalid bun run backend/scripts/test-fallback-simple.ts
   ```

2. **Check logs** for fallback behavior:
   - "Attempting Anthropic API call"
   - "Anthropic API call failed, attempting fallbacks"
   - "Falling back to Gemini"

   - Default: `['openrouter']`
3. **Verify response** - the model should identify itself in the response

   - "Attempting OpenRouter fallback"
## Supported Fallback Providers

- `openrouter`: OpenRouter API (Claude models via unified API)

**Note**: We use OpenRouter as the fallback provider, which provides access to Claude models through a unified API interface. This replaces the previous Vertex AI and Bedrock fallbacks.

## Important Notes

- Only Anthropic models support fallback currently
- Fallback providers use fewer retries (2 vs 3) to fail faster
   - Default: `['openrouter']`
- The AI SDK's built-in retry mechanism is used with `maxRetries` parameter
- Logs clearly indicate which provider is being used
