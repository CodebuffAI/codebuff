// Test TypeScript type resolution in ESM environment
import {
  CodebuffClient as ClientClass,
  getFilesStructured,
  getCustomToolDefinition,
} from '@openbuff/sdk'
import * as FullSDK from '@openbuff/sdk'

import type {
  CodebuffClient,
  CustomToolDefinition,
  ReadFilesResultV1,
  RunState,
} from '@openbuff/sdk'
;(async () => {
  // Test 1: Type imports work correctly
  const testClient: CodebuffClient = {} as any
  const testTool: CustomToolDefinition = {} as any
  const testState: RunState = {} as any
  const testReadResult: ReadFilesResultV1 = {} as any

  console.log('✅ Type imports successful')

  // Test 2: Value imports work correctly in TypeScript
  const clientConstructor = ClientClass
  const toolDefFunction = getCustomToolDefinition
  const structuredReadFunction = getFilesStructured

  console.log(
    '✅ Value imports successful:',
    typeof clientConstructor,
    typeof toolDefFunction,
    typeof structuredReadFunction,
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

  // Test 5: Dynamic imports also work in TypeScript ESM
  const dynamicSDK = await import('@openbuff/sdk')
  const ClientFromDynamic: typeof ClientClass = dynamicSDK.CodebuffClient
  console.log('✅ Dynamic imports work in TypeScript ESM')

  // Test 6: Namespace imports work
  const ClientFromNamespace: typeof ClientClass = FullSDK.CodebuffClient
  const structuredReadFromNamespace: typeof getFilesStructured =
    FullSDK.getFilesStructured
  console.log('✅ Namespace imports work correctly')

  void testClient
  void testTool
  void testState
  void testReadResult
  void mockClient
  void toolTypeTest
  void ClientFromDynamic
  void ClientFromNamespace
  void structuredReadFromNamespace
})()

export {} // Make this a module
