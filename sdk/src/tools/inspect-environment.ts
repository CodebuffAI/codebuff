import { inspectHarnessEnvironment } from '../services/harness-intelligence'
import type { CodebuffToolOutput } from '../../../common/src/tools/list'
export function inspectEnvironment(cwd: string): CodebuffToolOutput<'inspect_environment'> {
  return [{ type: 'json', value: inspectHarnessEnvironment(cwd) }]
}
