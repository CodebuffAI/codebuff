// Test TypeScript type resolution in CommonJS environment
import {
  CodebuffClient as ClientClass,
  getCustomToolDefinition,
} from '@codebuff/sdk'

import type {
  CodebuffClient,
  CustomToolDefinition,
  RunState,
} from '@codebuff/sdk'

// Test 1: Type imports work correctly
const testClient: CodebuffClient = {} as any
const testTool: CustomToolDefinition = {} as any
const testState: RunState = {} as any

console.log('✅ Type imports successful')

// Test 2: Value imports work correctly in TypeScript
const clientConstructor = ClientClass
const toolDefFunction = getCustomToolDefinition

console.log(
  '✅ Value imports successful:',
  typeof clientConstructor,
  typeof toolDefFunction,
)

// Test 3: Test actual instantiation would work (without requiring API key)
type ClientOptions = ConstructorParameters<typeof ClientClass>[0]

const mockOptions: ClientOptions = {
  apiKey: 'test-key',
}

// This should compile without errors
const mockClient = new ClientClass(mockOptions)

console.log('✅ Client instantiation types work correctly')

// Test 4: Custom tool definition types (compile-time only)
type MockTool = ReturnType<typeof getCustomToolDefinition>
const toolTypeTest: MockTool = {} as any

console.log('✅ Custom tool definition types work correctly')

// Test 5: CommonJS import syntax also works in TypeScript
const SDKRequire = require('@codebuff/sdk')
const ClientFromRequire: typeof ClientClass = SDKRequire.CodebuffClient

console.log('✅ CommonJS require syntax works in TypeScript')

export {} // Make this a module
