/**
 * Test script to verify Codex API message format conversions.
 * Tests various message types: user, assistant, multi-turn conversations.
 * 
 * Usage: bun scripts/test-codex-messages.ts [test-name]
 * 
 * Tests:
 *   simple     - Single user message (default)
 *   multi      - Multi-turn conversation with assistant messages
 *   system     - System message as instructions
 *   all        - Run all tests
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

// Read credentials
const credentialsPath = path.join(os.homedir(), '.config/manicode-dev/credentials.json')
const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
const accessToken = credentials.codexOAuth?.accessToken

if (!accessToken) {
  console.error('❌ No Codex OAuth credentials found')
  process.exit(1)
}

// Extract account ID from JWT
const parts = accessToken.split('.')
const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
const accountId = payload['https://api.openai.com/auth']?.chatgpt_account_id

if (!accountId) {
  console.error('❌ Could not extract account ID from token')
  process.exit(1)
}

console.log('✅ Credentials loaded')
console.log(`   Account ID: ${accountId}\n`)

// Test configurations
interface TestCase {
  name: string
  description: string
  body: Record<string, unknown>
}

const tests: TestCase[] = [
  {
    name: 'simple',
    description: 'Single user message',
    body: {
      model: 'gpt-5.2',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Say "Test 1 passed!" and nothing else.' }],
        },
      ],
      instructions: 'You are a helpful assistant.',
      store: false,
      stream: true,
      reasoning: { effort: 'medium', summary: 'auto' },
      text: { verbosity: 'medium' },
      include: ['reasoning.encrypted_content'],
    },
  },
  {
    name: 'multi',
    description: 'Multi-turn conversation with assistant message (output_text)',
    body: {
      model: 'gpt-5.2',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Remember the number 42.' }],
        },
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'I will remember the number 42.' }],
        },
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'What number did I tell you? Say just the number.' }],
        },
      ],
      instructions: 'You are a helpful assistant.',
      store: false,
      stream: true,
      reasoning: { effort: 'medium', summary: 'auto' },
      text: { verbosity: 'medium' },
      include: ['reasoning.encrypted_content'],
    },
  },
  {
    name: 'multi-wrong',
    description: 'Multi-turn with WRONG format (input_text for assistant - should fail)',
    body: {
      model: 'gpt-5.2',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Remember the number 42.' }],
        },
        {
          type: 'message',
          role: 'assistant',
          // WRONG: using input_text instead of output_text
          content: [{ type: 'input_text', text: 'I will remember the number 42.' }],
        },
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'What number did I tell you?' }],
        },
      ],
      instructions: 'You are a helpful assistant.',
      store: false,
      stream: true,
      reasoning: { effort: 'medium', summary: 'auto' },
      text: { verbosity: 'medium' },
      include: ['reasoning.encrypted_content'],
    },
  },
  {
    name: 'system',
    description: 'System message as developer role',
    body: {
      model: 'gpt-5.2',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'What is your name?' }],
        },
      ],
      instructions: 'Your name is CodexBot. Always introduce yourself by name.',
      store: false,
      stream: true,
      reasoning: { effort: 'medium', summary: 'auto' },
      text: { verbosity: 'medium' },
      include: ['reasoning.encrypted_content'],
    },
  },
  {
    name: 'tool-call',
    description: 'Tool call and result (function_call + function_call_output)',
    body: {
      model: 'gpt-5.2',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'What is 2+2? Use the calculator tool.' }],
        },
        {
          type: 'function_call',
          call_id: 'call_123',
          name: 'calculator',
          arguments: '{"expression": "2+2"}',
        },
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: '4',
        },
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'What was the result? Just say the number.' }],
        },
      ],
      instructions: 'You are a helpful assistant with access to a calculator tool.',
      store: false,
      stream: true,
      reasoning: { effort: 'medium', summary: 'auto' },
      text: { verbosity: 'medium' },
      include: ['reasoning.encrypted_content'],
    },
  },
]

async function runTest(test: TestCase): Promise<{ success: boolean; output: string; error?: string }> {
  console.log(`\n📋 Test: ${test.name}`)
  console.log(`   ${test.description}`)
  
  try {
    const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'chatgpt-account-id': accountId,
        'OpenAI-Beta': 'responses=experimental',
        'originator': 'codex_cli_rs',
        'accept': 'text/event-stream',
      },
      body: JSON.stringify(test.body),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.log(`   ❌ HTTP ${response.status}: ${errorBody}`)
      return { success: false, output: '', error: errorBody }
    }

    // Read and parse streaming response
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let output = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const event = JSON.parse(data)
          if (event.type === 'response.output_text.delta' && event.delta) {
            output += event.delta
            process.stdout.write(event.delta)
          }
        } catch {
          // Skip unparseable
        }
      }
    }

    console.log(`\n   ✅ Success: "${output.trim()}"`)
    return { success: true, output: output.trim() }
  } catch (error) {
    const err = error as Error
    console.log(`   ❌ Error: ${err.message}`)
    return { success: false, output: '', error: err.message }
  }
}

// Main
const testName = process.argv[2] || 'simple'

console.log('🧪 Codex API Message Format Tests\n')
console.log('=' .repeat(50))

if (testName === 'all') {
  let passed = 0
  let failed = 0
  
  for (const test of tests) {
    const result = await runTest(test)
    if (test.name === 'multi-wrong') {
      // This test SHOULD fail
      if (!result.success) {
        console.log('   ✅ (Expected failure - confirms input_text is invalid for assistant)')
        passed++
      } else {
        console.log('   ❌ (Unexpectedly succeeded - API may have changed)')
        failed++
      }
    } else {
      if (result.success) passed++
      else failed++
    }
  }
  
  console.log('\n' + '='.repeat(50))
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)
} else {
  const test = tests.find(t => t.name === testName)
  if (!test) {
    console.error(`Unknown test: ${testName}`)
    console.log('Available tests:', tests.map(t => t.name).join(', '))
    process.exit(1)
  }
  await runTest(test)
}
