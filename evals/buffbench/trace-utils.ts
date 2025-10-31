import type { AgentStep } from './agent-runner'

/**
 * Truncate trace data to save tokens while preserving structure
 * - read_files: Replace file content with '[TRUNCATED - file was read]'
 * - run_terminal_command/code_search: Truncate stdout to 500 chars
 */
export function truncateTrace(trace: AgentStep[]): AgentStep[] {
  return trace.map((step) => {
    if (step.type === 'tool_result') {
      const output = Array.isArray(step.output) ? step.output : [step.output]

      if (step.toolName === 'read_files') {
        const truncatedOutput = output.map((item: any) => {
          if (item.type === 'json' && Array.isArray(item.value)) {
            return {
              ...item,
              value: item.value.map((file: any) =>
                file.path && file.content
                  ? {
                      path: file.path,
                      content: '[TRUNCATED - file was read]',
                      referencedBy: file.referencedBy,
                    }
                  : file,
              ),
            }
          }
          return item
        })
        return { ...step, output: truncatedOutput }
      }

      if (
        step.toolName === 'run_terminal_command' ||
        step.toolName === 'code_search'
      ) {
        const truncatedOutput = output.map((item: any) => {
          if (item.type === 'json' && item.value?.stdout) {
            return {
              ...item,
              value: {
                ...item.value,
                stdout:
                  item.value.stdout.length > 500
                    ? item.value.stdout.slice(0, 500) + '... [TRUNCATED]'
                    : item.value.stdout,
              },
            }
          }
          return item
        })
        return { ...step, output: truncatedOutput }
      }
    }
    return step
  })
}
