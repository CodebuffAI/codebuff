import { processEditTransaction } from '../../../process-edit-transaction'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { FileChange } from '@codebuff/common/actions'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

declare const Bun: {
  Transpiler: new (options: { loader: BunTranspilerLoader }) => {
    transformSync: (content: string) => string
  }
}

type BunTranspilerLoader = 'js' | 'jsx' | 'ts' | 'tsx'

function getBunTranspilerLoader(path: string): BunTranspilerLoader | null {
  if (path.endsWith('.tsx')) return 'tsx'
  if (path.endsWith('.jsx')) return 'jsx'
  if (path.endsWith('.ts')) return 'ts'
  if (path.endsWith('.js')) return 'js'
  return null
}

export const handleEditTransaction = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'edit_transaction'>

    fileProcessingState: FileProcessingState
    logger: Logger

    requestClientToolCall: (
      toolCall: ClientToolCall<'edit_transaction'>,
    ) => Promise<CodebuffToolOutput<'edit_transaction'>>
    requestOptionalFile: RequestOptionalFileFn
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): Promise<{ output: CodebuffToolOutput<'edit_transaction'> }> => {
  const {
    previousToolCallFinished,
    toolCall,
    fileProcessingState,
    logger,
    requestClientToolCall,
    requestOptionalFile,
  } = params
  const { edits } = toolCall.input

  await previousToolCallFinished

  const uniquePaths = Array.from(new Set(edits.map((edit) => edit.path)))
  const initialContentByPath = new Map<string, string | null>()
  for (const path of uniquePaths) {
    const previousPromises = fileProcessingState.promisesByPath[path]
    const previousEdit = previousPromises?.[previousPromises.length - 1]
    const initialContent = previousEdit
      ? await previousEdit.then((maybeResult) =>
          maybeResult && 'content' in maybeResult
            ? maybeResult.content
            : requestOptionalFile({ ...params, filePath: path }),
        )
      : await requestOptionalFile({ ...params, filePath: path })

    initialContentByPath.set(path, initialContent)
  }

  const transactionResult = await processEditTransaction({
    edits,
    initialContentByPath,
    logger,
  })

  if ('error' in transactionResult) {
    for (const failure of transactionResult.failures) {
      fileProcessingState.failedEditRequiresReadByPath[failure.path] = true
    }

    return {
      output: [
        {
          type: 'json',
          value: {
            errorMessage: transactionResult.error,
            failures: transactionResult.failures,
          },
        },
      ],
    }
  }

  const markAllTransactionPathsAsRequiringRead = () => {
    for (const transactionFile of transactionResult.files) {
      fileProcessingState.failedEditRequiresReadByPath[
        transactionFile.path
      ] = true
    }
  }

  // --- VIRTUAL COMPILE TRANSACTIONS: Preflight Syntax Validation ---
  for (const file of transactionResult.files) {
    const loader = getBunTranspilerLoader(file.path)
    if (loader) {
      try {
        const transpiler = new Bun.Transpiler({ loader })
        transpiler.transformSync(file.content)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        markAllTransactionPathsAsRequiringRead()
        return {
          output: [
            {
              type: 'json',
              value: {
                errorMessage: [
                  `Preflight Syntax Validation Failed: Atomically rejected transaction due to syntax error in ${file.path}: ${errorMessage}`,
                  'NO files were changed. Do NOT resubmit the same edit_transaction; it will fail the same way.',
                  'Recovery: re-read the exact current lines of the broken file, then fix the specific syntax error with a small targeted edit.',
                  'For import changes specifically, prefer structured insert_import/remove_import operations instead of rewriting an entire import block — generated multi-import rewrites are the most common cause of this error (e.g. an `import { ... }` left without a valid `from "..."`).',
                ].join('\n'),
                failures: [
                  {
                    editIndex: -1,
                    path: file.path,
                    errorMessage,
                  },
                ],
              },
            },
          ],
        }
      }
    }
  }

  let clientResult: CodebuffToolOutput<'edit_transaction'>
  try {
    clientResult = await requestClientToolCall({
      toolCallId: toolCall.toolCallId,
      toolName: 'edit_transaction',
      input: transactionResult.files.map(
        (file): FileChange => ({
          type: 'patch',
          path: file.path,
          content: file.patch,
        }),
      ),
    })
  } catch (error) {
    markAllTransactionPathsAsRequiringRead()
    return {
      output: [
        {
          type: 'json',
          value: {
            errorMessage: [
              'edit_transaction failed while atomically applying preflighted patches.',
              `Client threw: ${error instanceof Error ? error.message : String(error)}`,
              'No in-memory transaction state was recorded. Re-read all affected files before retrying.',
            ].join('\n'),
            failures: [
              {
                editIndex: -1,
                path: transactionResult.files.map((file) => file.path).join(', '),
                errorMessage: error instanceof Error ? error.message : String(error),
              },
            ],
          },
        },
      ],
    }
  }

  const resultValue = clientResult[0]?.value
  if (
    resultValue &&
    typeof resultValue === 'object' &&
    'errorMessage' in resultValue
  ) {
    markAllTransactionPathsAsRequiringRead()
    return { output: clientResult }
  }

  const appliedFiles: {
    path: string
    patch: string
    messages: string[]
  }[] = []

  for (const file of transactionResult.files) {
    const fileProcessingResult = Promise.resolve({
      tool: 'edit_transaction' as const,
      path: file.path,
      toolCallId: toolCall.toolCallId,
      content: file.content,
      patch: file.patch,
      messages: file.messages,
    })
    if (!fileProcessingState.promisesByPath[file.path]) {
      fileProcessingState.promisesByPath[file.path] = []
    }
    fileProcessingState.promisesByPath[file.path].push(fileProcessingResult)
    fileProcessingState.allPromises.push(fileProcessingResult)
    delete fileProcessingState.failedEditRequiresReadByPath[file.path]

    appliedFiles.push({
      path: file.path,
      patch: file.patch,
      messages: file.messages,
    })
  }

  return {
    output: [
      {
        type: 'json',
        value: {
          message: transactionResult.message,
          files: appliedFiles,
        },
      },
    ],
  }
}) satisfies CodebuffToolHandlerFunction<'edit_transaction'>
