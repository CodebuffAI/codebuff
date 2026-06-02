# @vly-ai/integrations

Access AI models and email services through [vly.ai](https://vly.ai) without managing multiple API keys or accounts. Built on the AI SDK for reliable, type-safe AI Gateway integration.

## Why use @vly-ai/integrations?

Instead of creating separate accounts and managing API keys for OpenAI, Anthropic, SendGrid, Resend, etc., get a single deployment token from [vly.ai](https://vly.ai) and access all these services with automatic usage-based billing:

- **No API key management** - One token for all services (AI models, email, etc.)
- **No separate accounts** - Skip creating accounts with OpenAI, Anthropic, SendGrid, etc.
- **Usage-based billing** - Pay only for what you use, billed through your vly.ai deployment
- **Multiple AI models** - Access GPT-5, Claude 4, Gemini, Llama, and more through one API
- **Built on AI SDK** - Type-safe, production-ready integration

## Installation

```bash
pnpm add @vly-ai/integrations
```

## Getting Started

1. Sign up at [vly.ai](https://vly.ai) and create a deployment
2. Get your deployment token from the dashboard
3. Set it as an environment variable: `VLY_INTEGRATION_KEY`

## Usage

```typescript
import { createVlyIntegrations } from '@vly-ai/integrations';

const vly = createVlyIntegrations({
  deploymentToken: process.env.VLY_INTEGRATION_KEY,
  debug: false // optional
});

// AI Completions via AI Gateway - supports any Vercel AI Gateway model
const completion = await vly.ai.completion({
  model: 'gpt-5', // Or any model supported by Vercel AI Gateway
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' }
  ],
  temperature: 0.7,
  maxTokens: 150
});

// Streaming completions
await vly.ai.streamCompletion({
  model: 'claude-opus-4-1',
  messages: [{ role: 'user', content: 'Tell me a story...' }]
}, (chunk) => {
  process.stdout.write(chunk); // Real-time streaming
});

// Send Email
const emailResult = await vly.email.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to our service!</h1>',
  text: 'Welcome to our service!'
});
```

## AI Gateway Integration

Powered by the AI SDK with OpenAI-compatible provider for https://integrations.vly.ai

### Supported Models

The @vly-ai/integrations package supports **all models available through the Vercel AI Gateway**. This includes but is not limited to:

- **OpenAI Models**: GPT-5, GPT-5 Mini, GPT-5 Nano, GPT-4, GPT-3.5, etc.
- **Anthropic Claude**: Claude 4 Opus, Claude 4 Sonnet, Claude 3.7, Claude 3.5, Haiku, etc.
- **Google Models**: Gemini Pro, Gemini Flash, Gemini Ultra, etc.
- **Meta Models**: Llama models and variants
- **Mistral Models**: Mistral Large, Medium, Small, etc.
- **DeepSeek Models**: DeepSeek R1, DeepSeek Thinking, DeepSeek Coder, etc.
- **Qwen Models**: Qwen Coder and other variants
- **And many more...**

Simply pass any model identifier supported by the Vercel AI Gateway to the `model` parameter.

### Direct AI SDK Access

For advanced usage, access the AI SDK provider directly:

```typescript
import { generateText, streamText } from 'ai';

// Get the provider
const provider = vly.ai.getProvider();
const model = provider('gpt-5');

// Use with AI SDK directly
const result = await generateText({
  model,
  messages: [{ role: 'user', content: 'Hello!' }]
});

// Or streaming
const stream = await streamText({
  model,
  messages: [{ role: 'user', content: 'Tell me a story' }]
});

for await (const delta of stream.textStream) {
  process.stdout.write(delta);
}
```

## API Reference

### AI Integration

```typescript
// Create completion
vly.ai.completion(request: AICompletionRequest): Promise<ApiResponse<AICompletionResponse>>

// Stream completion
vly.ai.streamCompletion(
  request: AICompletionRequest,
  onChunk: (chunk: string) => void
): Promise<ApiResponse<AICompletionResponse>>

// Get AI SDK provider for direct usage
vly.ai.getProvider(): OpenAICompatibleProvider

// Generate embeddings (limited support)
vly.ai.embeddings(input: string | string[]): Promise<ApiResponse<{embeddings: number[][]}>>
```

### Email Integration

```typescript
// Send single email
vly.email.send(email: EmailRequest): Promise<ApiResponse<EmailResponse>>

// Send batch emails
vly.email.sendBatch(emails: EmailRequest[]): Promise<ApiResponse<EmailResponse[]>>

// Get email status
vly.email.getStatus(emailId: string): Promise<ApiResponse<EmailResponse>>

// Domain management
vly.email.verifyDomain(domain: string): Promise<ApiResponse>
vly.email.listDomains(): Promise<ApiResponse>
```

## Error Handling

All methods return an `ApiResponse` object with the following structure:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    credits: number;
    operation: string;
  };
}
```

Example error handling:

```typescript
const result = await vly.ai.completion({ ... });

if (result.success) {
  console.log('Response:', result.data);
  console.log('Credits used:', result.usage?.credits);
} else {
  console.error('Error:', result.error);
}
```

## Configuration

### Environment Variables

```bash
VLY_INTEGRATION_KEY=your_integration_key_here  # The key for authenticating with VLY
VLY_DEBUG=true  # optional, enables debug logging
```

### Debug Mode

Enable debug mode to see detailed logs:

```typescript
const vly = createVlyIntegrations({
  deploymentToken: process.env.VLY_INTEGRATION_KEY,  // Note: parameter is 'deploymentToken' but env var is 'VLY_INTEGRATION_KEY'
  debug: true
});
```

## Billing

All API calls are automatically billed to your deployment based on usage. The billing happens transparently through your deployment token, and usage information is included in the API responses.

## License

MIT