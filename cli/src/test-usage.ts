import { WebSocketClient } from './client-websocket'
import { bold, green } from 'picocolors'
import type { Message } from '../../common/src/actions'

// Ensure we're in development mode for debug logging
process.env.NODE_ENV = 'development'

// Create a test instance
const client = new WebSocketClient(() => {
  console.log('Error callback triggered')
})

// Test message callback to capture warnings
const messages: (Message | { role: 'system'; content: string })[] = []
client['messageCallback'] = (message: Message | { role: 'system'; content: string }) => {
  messages.push(message)
  if (typeof message.content === 'string') {
    console.log(`[${message.role}] ${message.content}`)
  } else {
    console.log(`[${message.role}] Complex message content (array)`)
  }
}

async function testUsageTracking() {
  console.log('\n=== Testing Usage Tracking ===\n')
  
  // Test 25% usage (no warning)
  console.log('Testing 25% usage...')
  const result25 = client.testSetUsage(25)
  console.log('Result:', result25)
  console.log('Warnings:', messages.length)
  messages.length = 0 // Clear messages
  
  // Test 50% usage (first warning)
  console.log('\nTesting 50% usage...')
  const result50 = client.testSetUsage(50)
  console.log('Result:', result50)
  console.log('Warnings:', messages.map(m => m.content))
  messages.length = 0
  
  // Test 75% usage (second warning)
  console.log('\nTesting 75% usage...')
  const result75 = client.testSetUsage(75)
  console.log('Result:', result75)
  console.log('Warnings:', messages.map(m => m.content))
  messages.length = 0
  
  // Test 90% usage (final warning)
  console.log('\nTesting 90% usage...')
  const result90 = client.testSetUsage(90)
  console.log('Result:', result90)
  console.log('Warnings:', messages.map(m => m.content))
  messages.length = 0
  
  // Test session credits
  console.log('\nTesting session credits...')
  const result1 = client.testSetUsage(10)
  const result2 = client.testSetUsage(20)
  console.log('Session credits increase:', result2.sessionCredits - result1.sessionCredits)
  
  // Test subscription status
  console.log('\nTesting subscription status...')
  const resultSub = client.testSetUsage(30, 200)
  console.log('Subscription active:', resultSub.subscriptionActive)
  console.log('Next quota reset:', resultSub.nextQuotaReset)
  
  console.log('\n=== Usage Tracking Test Complete ===\n')
}

// Run tests
testUsageTracking().catch(console.error)
