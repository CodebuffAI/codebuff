import type { CodebuffToolOutput } from '@codebuff/common/tools/list'

export function runFileChangeHooks({
  files,
}: {
  files: string[]
}): Promise<CodebuffToolOutput<'run_file_change_hooks'>> {
  // In the SDK, we don't have access to codebuff.json configuration
  // or the hook running infrastructure, so this is a no-op
  
  return Promise.resolve([
    {
      type: 'json',
      value: [
        {
          errorMessage: 'No file change hooks were triggered for the specified files. File change hooks are not supported in the SDK environment.',
        },
      ],
    },
  ])
}
