/**
 * Test file to demonstrate SDK error handling with disableConsoleErrors option
 */

import { CodebuffClient } from '../src/client'

// Test 1: Default behavior (console errors enabled)
console.log('Test 1: Default SDK behavior (console errors enabled)')
const client1 = new CodebuffClient({
  apiKey: 'test-api-key',
})
// This would trigger console.error if an error occurs

// Test 2: Custom error handler (console errors still enabled)
console.log('\nTest 2: Custom error handler with console errors')
const client2 = new CodebuffClient({
  apiKey: 'test-api-key',
  handleEvent: (event) => {
    if (event.type === 'error') {
      console.log(`Custom handler: ${event.message}`)
    }
  },
})
// This would call custom handler but not console.error

// Test 3: Disable console errors (no handler)
console.log('\nTest 3: Disabled console errors without handler')
const client3 = new CodebuffClient({
  apiKey: 'test-api-key',
  disableConsoleErrors: true,
})
// This would not trigger console.error even without a handler

// Test 4: CLI-style usage (custom handler + disabled console errors)
console.log('\nTest 4: CLI-style usage (custom handler + disabled console)')
const client4 = new CodebuffClient({
  apiKey: 'test-api-key',
  handleEvent: (event) => {
    if (event.type === 'error') {
      // Custom logging instead of console.error
      console.log(`[CLI Logger] Error: ${event.message}`)
    }
  },
  disableConsoleErrors: true,
})
// This is how the CLI uses it - custom handler only, no console.error

console.log('\nAll test clients created successfully!')
console.log('The disableConsoleErrors option allows clean error handling.')