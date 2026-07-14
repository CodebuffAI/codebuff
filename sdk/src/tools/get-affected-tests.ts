import { getAffectedTestTargets } from '../services/harness-intelligence'
import type { CodebuffToolOutput } from '../../../common/src/tools/list'
export function getAffectedTests(
  cwd: string,
  files: string[],
): CodebuffToolOutput<'get_affected_tests'> {
  return [
    { type: 'json', value: { targets: getAffectedTestTargets(cwd, files) } },
  ]
}
