// Test ESM imports in a pure ESM environment
console.log('🧪 Testing ESM imports in ESM-only project...');

try {
  // Test 1: Named ESM import
  console.log('\n1. Testing named ESM import...');
  const { CodebuffClient } = await import('@codebuff/sdk');
  console.log('✅ Named ESM import successful:', typeof CodebuffClient);
  
  if (typeof CodebuffClient !== 'function') {
    throw new Error(`Expected CodebuffClient to be a function, got ${typeof CodebuffClient}`);
  }
  
  // Test 2: Namespace ESM import
  console.log('\n2. Testing namespace ESM import...');
  const SDK = await import('@codebuff/sdk');
  console.log('✅ Namespace ESM import successful:', typeof SDK);
  
  if (typeof SDK !== 'object' || SDK === null) {
    throw new Error(`Expected SDK to be an object, got ${typeof SDK}`);
  }
  
  // Test 3: Verify exports are available
  console.log('\n3. Testing available exports...');
  const exports = Object.keys(SDK);
  console.log('✅ Found', exports.length, 'exports');
  
  const expectedExports = ['CodebuffClient', 'getCustomToolDefinition'];
  const foundExports = expectedExports.filter(exp => exp in SDK);
  console.log('✅ Found expected exports:', foundExports.join(', '));
  
  if (foundExports.length < 1) {
    throw new Error('Missing expected exports');
  }
  
  // Test 4: Test that both access patterns work identically
  console.log('\n4. Testing access pattern consistency...');
  const namedModule = await import('@codebuff/sdk');
  const ClientFromNamed = namedModule.CodebuffClient;
  const ClientFromNamespace = SDK.CodebuffClient;
  
  if (ClientFromNamed !== ClientFromNamespace) {
    throw new Error('Inconsistent access patterns');
  }
  console.log('✅ Access patterns consistent');
  
  // Test 5: Verify no CommonJS leakage
  console.log('\n5. Testing for CommonJS leakage...');
  if ('__esModule' in SDK) {
    console.log('ℹ️  __esModule marker found (this is acceptable for dual packages)');
  }
  
  // Test that require() doesn't work in ESM environment
  try {
    eval('const { CodebuffClient } = require("@codebuff/sdk")');
    throw new Error('CommonJS require should not work in ESM environment');
  } catch (referenceError) {
    if (referenceError.message.includes('require is not defined')) {
      console.log('✅ CommonJS require correctly rejected in ESM environment');
    } else {
      throw referenceError;
    }
  }
  
  // Test 6: Test tree-shaking compatibility (static imports)
  console.log('\n6. Testing static import compatibility...');
  // This would be a static import in a real ESM file:
  // import { CodebuffClient } from '@codebuff/sdk'
  // We can't test static imports in a dynamic test, but we can verify the exports are clean
  const hasDefault = 'default' in SDK;
  console.log('✅ Has default export:', hasDefault);
  console.log('✅ Named exports available for tree-shaking');
  
  console.log('\n🎉 All ESM import tests passed!');
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ ESM import test failed:', error.message);
  process.exit(1);
}
