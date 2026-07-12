import { describe, expect, it, afterEach } from 'bun:test'
import { handleApplySmartPatch as handleApplySmartPatchRuntime } from '../tools/handlers/tool/apply-smart-patch'
import { unlinkSync, existsSync } from 'fs'

const tempFilePath = 'packages/agent-runtime/src/__tests__/smart-patch-temp.ts'
const tempPythonPath =
  'packages/agent-runtime/src/__tests__/smart-patch-temp.py'
const tempGoPath = 'packages/agent-runtime/src/__tests__/smart-patch-temp.go'

const handleApplySmartPatch = (params: any) =>
  handleApplySmartPatchRuntime({
    ...params,
    requestClientToolCall: async (toolCall: any) => {
      if (
        toolCall.toolName !== 'write_file' ||
        toolCall.input.type !== 'file'
      ) {
        return [
          {
            type: 'json' as const,
            value: {
              errorMessage: 'Expected a full write_file client mutation.',
            },
          },
        ]
      }
      await Bun.write(toolCall.input.path, toolCall.input.content)
      return [
        {
          type: 'json' as const,
          value: {
            kind: 'file_mutation_result',
            version: 1,
            operationId: toolCall.toolCallId,
            outcome: 'applied',
            actions: [
              {
                actionId: `${toolCall.toolCallId}:0`,
                index: 0,
                action: 'update',
                path: toolCall.input.path,
                outcome: 'applied',
                beforeHash: toolCall.input.expectedHash,
                afterHash: 'after',
              },
            ],
            authorityTier: 'portable_path',
            receiptId: toolCall.toolCallId,
            errors: [],
            freshCapabilities: [],
          },
        },
      ]
    },
  } as any)

function cleanupTempFiles() {
  for (const path of [tempFilePath, tempPythonPath, tempGoPath]) {
    if (existsSync(path)) {
      try {
        unlinkSync(path)
      } catch (e) {}
    }
  }
}

describe('apply_smart_patch handler', () => {
  afterEach(() => {
    cleanupTempFiles()
  })

  it('Layer A & B: parses standard hunks and applies them with fuzzy alignment', async () => {
    const originalContent = `import { a } from './a'
import { b } from './b'

// Some filler comment
export function process(val: number) {
  const result = val * 2
  return result
}

// End of file filler
`
    await Bun.write(tempFilePath, originalContent)

    const patch = `@@ -12,5 +12,5 @@
 export function process(val: number) {
-  const result = val * 2
+  const result = val * 3
   return result
 }`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempFilePath,
          patch,
          fuzzFactor: 5,
          autoHeal: false,
          preflightCompile: false,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
      actions: [expect.objectContaining({ path: tempFilePath })],
    })

    const updatedContent = await Bun.file(tempFilePath).text()
    expect(updatedContent).toContain('const result = val * 3')
    expect(updatedContent).not.toContain('const result = val * 2')
  })

  it('[COR-H02] never auto-heals unmatched braces or mutates the file globally', async () => {
    const originalContent = `export function test() {
  console.log("hello")
}`
    await Bun.write(tempFilePath, originalContent)

    const patch = `@@ -1,3 +1,7 @@
 export function test() {
   console.log("hello")
 }
+export function newFunc() {
+  console.log("forgot closing brace")`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempFilePath,
          patch,
          fuzzFactor: 3,
          autoHeal: true,
          preflightCompile: true,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result.applied).toBe(false)
    expect(result.validatorStatus).toBe('failed')
    expect(result.validatorIdentity).toBe('bun-transpiler:ts')

    const updatedContent = await Bun.file(tempFilePath).text()
    expect(updatedContent).toBe(originalContent)
  })

  it('Preflight Validation: fails if the code has a syntax error that cannot be healed', async () => {
    const originalContent = `export function test() {
  console.log("hello")
}`
    await Bun.write(tempFilePath, originalContent)

    const patch = `@@ -1,3 +1,4 @@
 export function test() {
-  console.log("hello")
+  const x = ; // illegal syntax
 }`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempFilePath,
          patch,
          fuzzFactor: 3,
          autoHeal: true,
          preflightCompile: true,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result.applied).toBe(false)
    expect(result.validatorStatus).toBe('failed')
    expect(result.validatorIdentity).toBe('bun-transpiler:ts')
    expect(result.message).toContain('Preflight Syntax Validation Failed')

    const updatedContent = await Bun.file(tempFilePath).text()
    expect(updatedContent).toBe(originalContent)
  })

  it('Three-Way Merge: reconciles non-overlapping drift with patch edits successfully', async () => {
    const driftedContent = `import { a } from './a'
import { extra } from './extra'
export function test() {
  const message = "hello world"
  console.log(message)
}`
    await Bun.write(tempFilePath, driftedContent)

    const patch = `@@ -3,3 +3,3 @@
 export function test() {
-  const message = "hello world"
+  const message = "hello buffy"
   console.log(message)`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempFilePath,
          patch,
          fuzzFactor: 5,
          autoHeal: false,
          preflightCompile: false,
        },
      },
      requestOptionalFile: async () => driftedContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
    })

    const finalContent = await Bun.file(tempFilePath).text()
    expect(finalContent).toBe(`import { a } from './a'
import { extra } from './extra'
export function test() {
  const message = "hello buffy"
  console.log(message)
}`)
  })

  it('Three-Way Merge: fails closed when patch and file both changed the same line', async () => {
    const driftedContent = `export function test() {
  const message = "hello local"
  console.log(message)
}`
    await Bun.write(tempFilePath, driftedContent)

    const patch = `@@ -1,4 +1,4 @@
 export function test() {
-  const message = "hello world"
+  const message = "hello buffy"
   console.log(message)
 }`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempFilePath,
          patch,
          fuzzFactor: 5,
          autoHeal: false,
          preflightCompile: false,
        },
      },
      requestOptionalFile: async () => driftedContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result.applied).toBe(false)
    expect(result.message).toContain('Smart patch conflict')
    expect(await Bun.file(tempFilePath).text()).toBe(driftedContent)
  })

  it('Python preflight: rejects indentation increases without a block colon', async () => {
    const originalContent = `def greet():
    print("hello")
`
    await Bun.write(tempPythonPath, originalContent)

    const patch = `@@ -1,2 +1,3 @@
 def greet():
     print("hello")
+        print("bad indent")`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempPythonPath,
          patch,
          fuzzFactor: 3,
          autoHeal: true,
          preflightCompile: true,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result.applied).toBe(false)
    expect(result.message).toContain('Python indentation increases')
    expect(await Bun.file(tempPythonPath).text()).toBe(originalContent)
  })

  it('Python preflight: allows continuation indentation and triple-quoted strings', async () => {
    const originalContent = `def build_message():
    return (
        "hello"
    )
`
    await Bun.write(tempPythonPath, originalContent)

    const patch = `@@ -1,4 +1,7 @@
 def build_message():
+    """Builds a message.
+        This indentation is inside a docstring.
+    """
     return (
-        "hello"
+        "hello buffy"
     )`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempPythonPath,
          patch,
          fuzzFactor: 3,
          autoHeal: true,
          preflightCompile: true,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
    })
    expect(await Bun.file(tempPythonPath).text()).toContain('hello buffy')
  })

  it('Go preflight: rejects files missing a package declaration', async () => {
    const originalContent = `package main

func main() {
}
`
    await Bun.write(tempGoPath, originalContent)

    const patch = `@@ -1,4 +1,3 @@
-package main
-
 func main() {
 }`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempGoPath,
          patch,
          fuzzFactor: 3,
          autoHeal: true,
          preflightCompile: true,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result.applied).toBe(false)
    expect(result.message).toContain(
      'Go files must include a valid package declaration',
    )
    expect(await Bun.file(tempGoPath).text()).toBe(originalContent)
  })

  it('fails closed instead of applying a hunk at the wrong line when no match is found', async () => {
    const originalContent = `export const safe = true
export const untouched = true
`
    await Bun.write(tempFilePath, originalContent)

    const patch = `@@ -1,2 +1,2 @@
-export const missing = true
+export const missing = false
 export const other = true`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempFilePath,
          patch,
          fuzzFactor: 0,
          autoHeal: false,
          preflightCompile: false,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result.applied).toBe(false)
    expect(result.message).toContain('could not find a unique matching hunk')
    expect(await Bun.file(tempFilePath).text()).toBe(originalContent)
  })

  it('[SEC-H03] does not search globally beyond the bounded hunk range', async () => {
    const filler = Array.from(
      { length: 30 },
      (_, index) => `// filler ${index}`,
    )
    const originalContent = [...filler, 'export const target = true', ''].join(
      '\n',
    )
    await Bun.write(tempFilePath, originalContent)
    const patch = `@@ -1,1 +1,1 @@
-export const target = true
+export const target = false`
    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempFilePath,
          patch,
          fuzzFactor: 0,
          autoHeal: false,
          preflightCompile: false,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    expect(output[0].value.applied).toBe(false)
    expect(await Bun.file(tempFilePath).text()).toBe(originalContent)
  })

  it('[COR-H01] applies insertion-only hunks at the exact adjusted position', async () => {
    const originalContent = 'first\nsecond\nthird\n'
    await Bun.write(tempFilePath, originalContent)
    const patch = `@@ -2,0 +3,1 @@
+inserted`
    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempFilePath,
          patch,
          fuzzFactor: 3,
          autoHeal: false,
          preflightCompile: false,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    expect(output[0].value).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
    })
    expect(await Bun.file(tempFilePath).text()).toBe(
      'first\nsecond\ninserted\nthird\n',
    )
  })

  it('Python preflight: ignores # characters inside strings', async () => {
    const originalContent = `def has_hash(value):
    if value == "#":
        return True
    return False
`
    await Bun.write(tempPythonPath, originalContent)

    const patch = `@@ -1,4 +1,4 @@
 def has_hash(value):
     if value == "#":
-        return True
+        return bool(value)
     return False`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempPythonPath,
          patch,
          fuzzFactor: 3,
          autoHeal: true,
          preflightCompile: true,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
    })
    expect(await Bun.file(tempPythonPath).text()).toContain(
      'return bool(value)',
    )
  })

  it('Go preflight: allows function types and multiline function declarations', async () => {
    const originalContent = `package main

type HandlerFunc func(string) bool

func main() {
}
`
    await Bun.write(tempGoPath, originalContent)

    const patch = `@@ -1,6 +1,10 @@
 package main
 
-type HandlerFunc func(string) bool
+type HandlerFunc func(string) error
 
-func main() {
+func main(
+) {
+}
+
+func next() {
 }`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempGoPath,
          patch,
          fuzzFactor: 3,
          autoHeal: true,
          preflightCompile: true,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
    })
    const updatedContent = await Bun.file(tempGoPath).text()
    expect(updatedContent).toContain('type HandlerFunc func(string) error')
    expect(updatedContent).toContain('func main(\n) {')
  })

  it('Go preflight: allows multiline return parameter lists', async () => {
    const originalContent = `package main

import "context"

func foo(
    ctx context.Context,
) (
    string,
    error,
) {
    return "ok", nil
}
`
    await Bun.write(tempGoPath, originalContent)

    const patch = `@@ -8,5 +8,5 @@
     string,
     error,
 ) {
-    return "ok", nil
+    return "buffy", nil
 }`

    const fileProcessingState = {
      promisesByPath: {},
      allPromises: [],
      failedEditRequiresReadByPath: {},
    }

    const { output } = await handleApplySmartPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: tempGoPath,
          patch,
          fuzzFactor: 3,
          autoHeal: true,
          preflightCompile: true,
        },
      },
      requestOptionalFile: async () => originalContent,
      fileProcessingState,
    } as any)

    const result = output[0].value
    expect(result).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
    })
    expect(await Bun.file(tempGoPath).text()).toContain('return "buffy", nil')
  })
})
