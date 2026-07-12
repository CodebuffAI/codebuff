import { getBuildTargets as resolveBuildTargets } from '../services/harness-intelligence'
import type { CodebuffToolOutput } from '../../../common/src/tools/list'
export function getBuildTargets(cwd: string, files: string[]): CodebuffToolOutput<'get_build_targets'> {
  return [{ type: 'json', value: { targets: resolveBuildTargets(cwd, files) } }]
}
