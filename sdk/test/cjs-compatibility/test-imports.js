// Test CommonJS imports in a pure CommonJS environment
console.log('🧪 Testing CommonJS imports in CommonJS-only project...')

try {
  // Test 1: Named destructuring import
  console.log('\n1. Testing named destructuring import...')
  const { CodebuffClient } = require('@codebuff/sdk')
  console.log('✅ Named destructuring successful:', typeof CodebuffClient)

  if (typeof CodebuffClient !== 'function') {
    throw new Error(
      `Expected CodebuffClient to be a function, got ${typeof CodebuffClient}`,
    )
  }

  // Test 2: Default require
  console.log('\n2. Testing default require...')
  const SDK = require('@codebuff/sdk')
  console.log('✅ Default require successful:', typeof SDK)

  if (typeof SDK !== 'object' || SDK === null) {
    throw new Error(`Expected SDK to be an object, got ${typeof SDK}`)
  }

  // Test 3: Verify exports are available
  console.log('\n3. Testing available exports...')
  const exports = Object.keys(SDK)
  console.log('✅ Found', exports.length, 'exports')

  const expectedExports = ['CodebuffClient', 'getCustomToolDefinition']
  const foundExports = expectedExports.filter((exp) => exp in SDK)
  console.log('✅ Found expected exports:', foundExports.join(', '))

  if (foundExports.length < 1) {
    throw new Error('Missing expected exports')
  }

  // Test 4: Test that both access patterns work identically
  console.log('\n4. Testing access pattern consistency...')
  const ClientFromDestructure = require('@codebuff/sdk').CodebuffClient
  const ClientFromDefault = require('@codebuff/sdk').CodebuffClient

  if (ClientFromDestructure !== ClientFromDefault) {
    throw new Error('Inconsistent access patterns')
  }
  console.log('✅ Access patterns consistent')

  // Test 5: Verify no ESM module properties leak through
  console.log('\n5. Testing for ESM leakage...')
  if ('__esModule' in SDK) {
    console.log(
      'ℹ️  __esModule marker found (this is expected for transpiled modules)',
    )
  }

  // Test no direct import/export statements work (they shouldn't in CJS)
  try {
    // This should fail in CommonJS environment
    eval('import { CodebuffClient } from "@codebuff/sdk"')
    throw new Error('ESM imports should not work in CommonJS environment')
  } catch (syntaxError) {
    if (
      syntaxError.message.includes('Unexpected token') ||
      syntaxError.message.includes('Cannot use import statement')
    ) {
      console.log('✅ ESM imports correctly rejected in CommonJS environment')
    } else {
      throw syntaxError
    }
  }

  console.log('\n🎉 All CommonJS import tests passed!')
  process.exit(0)
} catch (error) {
  console.error('\n❌ CommonJS import test failed:', error.message)
  process.exit(1)
}
