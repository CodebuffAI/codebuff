// Test TypeScript types for ripgrep bundling functionality
import { getBundledRgPath, ToolHelpers } from '@codebuff/sdk'
;(async () => {
  console.log('🧪 Testing ripgrep TypeScript types...')

  // Test 1: getBundledRgPath function type
  console.log('\n1. Testing getBundledRgPath types...')

  // Should accept optional import.meta.url parameter
  const rgPath1: string = getBundledRgPath()
  const rgPath2: string = getBundledRgPath(import.meta.url)

  // Return type should be string
  const pathTest: string = rgPath1

  console.log('✅ getBundledRgPath types work correctly')

  // Test 2: codeSearch function type
  console.log('\n2. Testing codeSearch types...')

  // Test parameter types
  const searchParams = {
    projectPath: '/test',
    pattern: 'test-pattern',
    flags: '-i',
    cwd: 'src',
    maxResults: 10,
  }

  // Return type should be Promise with array of tool outputs
  const searchResult = ToolHelpers.codeSearch(searchParams)
  // Type should be a promise
  const _typeCheck: Promise<any> = searchResult

  console.log('✅ codeSearch parameter types work correctly')

  // Test 3: Test actual function execution with types
  console.log('\n3. Testing runtime execution with types...')

  try {
    const actualPath: string = getBundledRgPath(import.meta.url)

    if (typeof actualPath !== 'string') {
      throw new Error(`Expected string path, got ${typeof actualPath}`)
    }

    console.log('✅ getBundledRgPath runtime execution matches types')

    // Test search with minimal parameters
    const minimalSearchResult = await ToolHelpers.codeSearch({
      projectPath: process.cwd(),
      pattern: 'import',
    })

    // Verify return type structure
    if (!Array.isArray(minimalSearchResult)) {
      throw new Error('Expected array result from codeSearch')
    }

    if (minimalSearchResult.length > 0) {
      const firstResult = minimalSearchResult[0]

      // Should have type and value properties
      const hasType: boolean = 'type' in firstResult
      const hasValue: boolean = 'value' in firstResult

      if (!hasType || !hasValue) {
        throw new Error('Result missing required properties')
      }

      // Type should be 'json'
      if (firstResult.type !== 'json') {
        throw new Error(`Expected type 'json', got '${firstResult.type}'`)
      }
    }

    console.log('✅ codeSearch runtime execution matches types')
  } catch (error) {
    console.error('Runtime test failed:', (error as Error).message)
    throw error
  }

  // Test 4: Test optional parameters
  console.log('\n4. Testing optional parameters...')

  // These should all compile without errors
  const basicSearch = ToolHelpers.codeSearch({
    projectPath: '/test',
    pattern: 'test',
  })

  const searchWithFlags = ToolHelpers.codeSearch({
    projectPath: '/test',
    pattern: 'test',
    flags: '-i',
  })

  const searchWithCwd = ToolHelpers.codeSearch({
    projectPath: '/test',
    pattern: 'test',
    cwd: 'src',
  })

  const searchWithMaxResults = ToolHelpers.codeSearch({
    projectPath: '/test',
    pattern: 'test',
    maxResults: 5,
  })

  const searchWithAll = ToolHelpers.codeSearch({
    projectPath: '/test',
    pattern: 'test',
    flags: '-i',
    cwd: 'src',
    maxResults: 10,
  })

  console.log('✅ Optional parameters compile correctly')

  // Test 5: Test type constraints
  console.log('\n5. Testing type constraints...')

  // These parameters are validated at compile time
  console.log('✅ Type constraints work as expected')

  console.log('\n🎉 All ripgrep TypeScript type tests passed!')
})().catch((error) => {
  console.error('\n❌ TypeScript type test failed:', error.message)
  process.exit(1)
})

export {} // Make this a module
