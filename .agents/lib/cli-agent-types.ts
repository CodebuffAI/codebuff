export interface InputParamDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
}

// Prevent extraInputParams from overriding 'mode' at compile time
export type ExtraInputParams = Omit<Record<string, InputParamDefinition>, 'mode'>

export interface CliAgentConfig {
  id: string
  displayName: string
  cliName: string
  /** Used for session naming, e.g., 'claude-code' -> sessions named 'claude-code-test' */
  shortName: string
  startCommand: string
  permissionNote: string
  model: string
  spawnerPromptExtras?: string
  extraInputParams?: ExtraInputParams
  reviewModeInstructions?: string
  cliSpecificDocs?: string
}
