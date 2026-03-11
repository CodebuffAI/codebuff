/**
 * Type declarations for the auto-generated bundled agents module.
 *
 * The actual file (bundled-agents.generated.ts) is created by
 * cli/scripts/prebuild-agents.ts and is gitignored. This declaration
 * file lets TypeScript resolve the module when the generated file
 * has not been built yet.
 */
import type { LocalAgentInfo } from '../utils/local-agent-registry'

export declare const bundledAgents: Record<string, any>
export declare function getBundledAgentsAsLocalInfo(): LocalAgentInfo[]
export declare function getBundledAgentIds(): string[]
export declare function isBundledAgent(agentId: string): boolean
