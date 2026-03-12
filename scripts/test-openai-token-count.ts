#!/usr/bin/env bun

/**
 * Tests the OpenAI Responses API token counting endpoint (POST /v1/responses/input_tokens/count)
 * against the real API to verify our integration works correctly.
 *
 * Usage:
 *   bun scripts/test-openai-token-count.ts
 *
 * Requires OPENAI_API_KEY environment variable to be set.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is required')
  process.exit(1)
}

const ENDPOINT = 'https://api.openai.com/v1/responses/input_tokens'

// Models to test — tries each, skips if unavailable
const MODELS_TO_TEST = ['gpt-5.3-codex', 'gpt-5.3', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini']

interface TokenCountResponse {
  object: string
  input_tokens: number
}

interface TestCase {
  name: string
  body: Record<string, unknown>
  validate: (response: TokenCountResponse) => void
}

async function callTokenCount(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: TokenCountResponse } | { ok: false; status: number; error: string }> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return { ok: false, status: response.status, error: errorText }
  }

  const data = (await response.json()) as TokenCountResponse
  return { ok: true, data }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function buildTestCases(model: string): TestCase[] {
  return [
    // === Basic functionality ===
    {
      name: '1. Simple text message (string content)',
      body: {
        model,
        input: [{ role: 'user', content: 'Hello world' }],
      },
      validate: (res) => {
        assert(res.input_tokens > 0, `Expected > 0 tokens, got ${res.input_tokens}`)
        assert(res.input_tokens < 50, `Expected < 50 tokens for short message, got ${res.input_tokens}`)
      },
    },
    {
      name: '2. Simple text as plain string input (not array)',
      body: {
        model,
        input: 'Hello world',
      },
      validate: (res) => {
        assert(res.input_tokens > 0, `Expected > 0 tokens, got ${res.input_tokens}`)
      },
    },

    // === System prompt / instructions ===
    {
      name: '3. With instructions (system prompt)',
      body: {
        model,
        input: [{ role: 'user', content: 'Hello' }],
        instructions: 'You are a helpful coding assistant. Always respond in TypeScript.',
      },
      validate: (res) => {
        assert(res.input_tokens > 10, `Expected > 10 tokens with instructions, got ${res.input_tokens}`)
      },
    },
    {
      name: '4. Instructions add tokens vs no instructions',
      body: {
        model,
        input: [{ role: 'user', content: 'Hi' }],
      },
      validate: () => {},
    },
    {
      name: '4b. Same input WITH instructions (compare with 4)',
      body: {
        model,
        input: [{ role: 'user', content: 'Hi' }],
        instructions: 'You are an expert software engineer who writes clean, well-tested TypeScript code.',
      },
      validate: () => {},
    },

    // === Multi-turn conversations ===
    {
      name: '5. Multi-turn conversation (user → assistant → user)',
      body: {
        model,
        input: [
          { role: 'user', content: 'What is TypeScript?' },
          { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.' },
          { role: 'user', content: 'How do I define an interface?' },
        ],
      },
      validate: (res) => {
        assert(res.input_tokens > 20, `Expected > 20 tokens for multi-turn, got ${res.input_tokens}`)
      },
    },
    {
      name: '6. Many-turn conversation (10 exchanges)',
      body: {
        model,
        input: Array.from({ length: 10 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message number ${i + 1} in this conversation.`,
        })),
      },
      validate: (res) => {
        assert(res.input_tokens > 50, `Expected > 50 tokens for 10 messages, got ${res.input_tokens}`)
      },
    },

    // === Content format edge cases ===
    {
      name: '7. Content as typed input_text array',
      body: {
        model,
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: 'Hello world' }],
          },
        ],
      },
      validate: (res) => {
        assert(res.input_tokens > 0, `Expected > 0 tokens, got ${res.input_tokens}`)
      },
    },
    {
      name: '8. Plain string content (our current format)',
      body: {
        model,
        input: [
          { role: 'user', content: 'Hello world' },
        ],
      },
      validate: (res) => {
        assert(res.input_tokens > 0, `Expected > 0 tokens, got ${res.input_tokens}`)
      },
    },

    // === Long content ===
    {
      name: '9. Long text content (~500 words)',
      body: {
        model,
        input: [
          {
            role: 'user',
            content: 'Please review this code:\n' + generateLongText(500),
          },
        ],
      },
      validate: (res) => {
        assert(res.input_tokens > 200, `Expected > 200 tokens for long text, got ${res.input_tokens}`)
      },
    },

    // === JSON / structured content ===
    {
      name: '10. JSON-stringified content',
      body: {
        model,
        input: [
          {
            role: 'user',
            content: JSON.stringify({
              action: 'read_file',
              path: 'src/index.ts',
              options: { encoding: 'utf-8', recursive: true },
            }),
          },
        ],
      },
      validate: (res) => {
        assert(res.input_tokens > 10, `Expected > 10 tokens for JSON content, got ${res.input_tokens}`)
      },
    },

    // === Code content ===
    {
      name: '11. Code snippet content',
      body: {
        model,
        input: [
          {
            role: 'user',
            content: `Fix this TypeScript function:
\`\`\`typescript
export async function fetchData(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(\`HTTP error: \${response.status}\`)
  }
  return response.json()
}
\`\`\``,
          },
        ],
      },
      validate: (res) => {
        assert(res.input_tokens > 20, `Expected > 20 tokens for code content, got ${res.input_tokens}`)
      },
    },

    // === Minimal / edge inputs ===
    {
      name: '12. Single character message',
      body: {
        model,
        input: [{ role: 'user', content: 'x' }],
      },
      validate: (res) => {
        assert(res.input_tokens > 0, `Expected > 0 tokens for single char, got ${res.input_tokens}`)
      },
    },
    {
      name: '13. Empty string message',
      body: {
        model,
        input: [{ role: 'user', content: '' }],
      },
      validate: (res) => {
        assert(res.input_tokens >= 0, `Expected >= 0 tokens for empty string, got ${res.input_tokens}`)
      },
    },
    {
      name: '14. Unicode / emoji content',
      body: {
        model,
        input: [
          { role: 'user', content: '你好世界 🌍 こんにちは مرحبا' },
        ],
      },
      validate: (res) => {
        assert(res.input_tokens > 0, `Expected > 0 tokens for unicode, got ${res.input_tokens}`)
      },
    },
    {
      name: '15. Newlines and special characters',
      body: {
        model,
        input: [
          { role: 'user', content: 'Line 1\nLine 2\nLine 3\t\ttabbed\n\n\nMultiple blank lines' },
        ],
      },
      validate: (res) => {
        assert(res.input_tokens > 5, `Expected > 5 tokens, got ${res.input_tokens}`)
      },
    },

    // === Empty / degenerate inputs ===
    {
      name: '16. Empty input array',
      body: {
        model,
        input: [],
      },
      validate: (res) => {
        assert(res.input_tokens >= 0, `Expected >= 0 tokens for empty input, got ${res.input_tokens}`)
      },
    },

    // === Tool-like content (what our converter produces for tool results) ===
    {
      name: '17. Tool result as user message (our conversion pattern)',
      body: {
        model,
        input: [
          { role: 'user', content: 'Read the file src/index.ts' },
          {
            role: 'assistant',
            content: 'I\'ll read that file for you.',
          },
          {
            role: 'user',
            content: 'export function main() {\n  console.log("Hello, world!");\n}',
          },
        ],
      },
      validate: (res) => {
        assert(res.input_tokens > 20, `Expected > 20 tokens for tool result pattern, got ${res.input_tokens}`)
      },
    },
  ]
}

function generateLongText(wordCount: number): string {
  const words = [
    'function', 'const', 'let', 'return', 'async', 'await', 'import', 'export',
    'interface', 'type', 'class', 'extends', 'implements', 'string', 'number',
    'boolean', 'undefined', 'null', 'void', 'promise', 'array', 'object', 'map',
    'set', 'error', 'try', 'catch', 'throw', 'new', 'this', 'super', 'if', 'else',
    'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'default',
  ]
  return Array.from({ length: wordCount }, (_, i) => words[i % words.length]).join(' ')
}

async function findWorkingModel(): Promise<string | null> {
  for (const model of MODELS_TO_TEST) {
    const result = await callTokenCount({
      model,
      input: [{ role: 'user', content: 'test' }],
    })
    if (result.ok) {
      return model
    }
    console.log(`  ⚠ Model ${model} not available (${result.status}: ${result.error.slice(0, 120)}), trying next...`)
  }
  return null
}

async function main() {
  console.log('\n=== OpenAI Responses API Token Counting — Real API Tests ===\n')
  console.log(`Endpoint: ${ENDPOINT}`)
  console.log(`API key: ${OPENAI_API_KEY!.slice(0, 8)}...${OPENAI_API_KEY!.slice(-4)}`)
  console.log('')

  // Find a working model
  console.log('Finding available model...')
  const model = await findWorkingModel()
  if (!model) {
    console.error('❌ No available models found. Check your API key and model access.')
    process.exit(1)
  }
  console.log(`✅ Using model: ${model}\n`)

  const testCases = buildTestCases(model)
  let passed = 0
  let failed = 0
  const results: Array<{ name: string; tokens: number | null; status: string; error?: string }> = []

  for (const testCase of testCases) {
    process.stdout.write(`  ${testCase.name} ... `)

    const result = await callTokenCount(testCase.body)

    if (!result.ok) {
      console.log(`❌ API error (${result.status})`)
      console.log(`    ${result.error.slice(0, 300)}`)
      // If auth error, no point continuing — every test will fail
      if (result.status === 401) {
        console.log('\n❌ Authentication failed. Check your OPENAI_API_KEY.')
        process.exit(1)
      }
      failed++
      results.push({ name: testCase.name, tokens: null, status: 'API_ERROR', error: result.error.slice(0, 200) })
      continue
    }

    try {
      testCase.validate(result.data)
      console.log(`✅ (${result.data.input_tokens} tokens)`)
      passed++
      results.push({ name: testCase.name, tokens: result.data.input_tokens, status: 'PASS' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`❌ ${msg}`)
      failed++
      results.push({ name: testCase.name, tokens: result.data.input_tokens, status: 'FAIL', error: msg })
    }
  }

  // === Content format comparison ===
  console.log('\n--- Content Format Comparison ---')
  console.log('Comparing plain string content vs typed input_text array:\n')

  const formatComparisonInputs = [
    'Hello world',
    'This is a longer sentence with more tokens to count accurately.',
    'function foo() { return 42; }',
  ]

  for (const text of formatComparisonInputs) {
    const [plainResult, typedResult] = await Promise.all([
      callTokenCount({
        model,
        input: [{ role: 'user', content: text }],
      }),
      callTokenCount({
        model,
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text }],
          },
        ],
      }),
    ])

    const plainTokens = plainResult.ok ? plainResult.data.input_tokens : 'ERROR'
    const typedTokens = typedResult.ok ? typedResult.data.input_tokens : 'ERROR'
    const match = plainTokens === typedTokens ? '✅ MATCH' : '⚠️  DIFFER'

    console.log(`  "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}":`)
    console.log(`    Plain string:  ${plainTokens} tokens`)
    console.log(`    Typed array:   ${typedTokens} tokens`)
    console.log(`    ${match}`)
    console.log('')
  }

  // === Summary ===
  console.log('\n--- Summary ---')
  console.log(`Model: ${model}`)
  console.log(`Total: ${testCases.length} tests`)
  console.log(`Passed: ${passed}`)
  console.log(`Failed: ${failed}`)

  // Token comparison for tests 4 vs 4b (instructions impact)
  const test4 = results.find((r) => r.name.startsWith('4.'))!
  const test4b = results.find((r) => r.name.startsWith('4b.'))!
  if (test4?.tokens != null && test4b?.tokens != null) {
    console.log(`\nInstructions impact: ${test4.tokens} tokens → ${test4b.tokens} tokens (+${test4b.tokens - test4.tokens} from instructions)`)
  }

  // Token comparison for tests 7 vs 8 (content format)
  const test7 = results.find((r) => r.name.startsWith('7.'))!
  const test8 = results.find((r) => r.name.startsWith('8.'))!
  if (test7?.tokens != null && test8?.tokens != null) {
    const formatMatch = test7.tokens === test8.tokens
    console.log(`Content format: typed=${test7.tokens}, plain=${test8.tokens} ${formatMatch ? '(✅ equivalent)' : '(⚠️  different!)'}`)
  }

  console.log('')

  if (failed > 0) {
    console.log('❌ Some tests failed. Review the output above.')
    process.exit(1)
  } else {
    console.log('✅ All tests passed!')
  }
}

main().catch((error) => {
  console.error('\n❌ Script error:')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
