# LLM API Integration

## Overview

The LLM API integration provides unified access to multiple AI providers through the Vercel AI SDK. All models are now handled directly through the AI SDK without complex fallback mechanisms.

## Supported Providers

1. **Anthropic**: Claude models via direct API
2. **OpenAI**: GPT models and O-series models
3. **Google**: Gemini models with thinking support
4. **OpenRouter**: Claude and Gemini models via unified API
5. **Vertex AI**: Finetuned models
6. **DeepSeek**: Chat and reasoning models

## Provider Configuration

Each provider is configured in `backend/src/llm-apis/vercel-ai-sdk/`:

- `ai-sdk.ts`: Main integration logic
- `openrouter.ts`: OpenRouter provider using OpenAI-compatible API
- `vertex-finetuned.ts`: Custom Vertex AI finetuned models

## Model Selection

Models are defined in `common/src/constants.ts` and automatically routed to the appropriate provider based on the model identifier.

## OpenRouter Integration

OpenRouter provides access to Claude models through a unified API:

- Uses OpenAI-compatible API format
- Configured with custom headers for Codebuff
- Supports all major Claude model variants
- Pricing tracked separately in cost calculator

## Cost Tracking

All API calls are tracked for billing purposes with provider-specific pricing in `message-cost-tracker.ts`.
