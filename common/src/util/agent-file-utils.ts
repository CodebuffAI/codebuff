/**
 * Utility functions for working with agent template files
 */

/**
 * Determines if a file is a valid custom agent template file.
 * 
 * Custom agent files must:
 * - End with .ts extension
 * - NOT end with .d.ts (TypeScript declaration files)
 * 
 * @param fileName - The name of the file to check
 * @returns true if the file is a valid custom agent template
 */
export function isCustomAgentFile(fileName: string): boolean {
  return fileName.endsWith('.ts') && !fileName.endsWith('.d.ts')
}

/**
 * Filters a list of file names to only include valid custom agent template files.
 * 
 * @param fileNames - Array of file names to filter
 * @returns Array of file names that are valid custom agent templates
 */
export function filterCustomAgentFiles(fileNames: string[]): string[] {
  return fileNames.filter(isCustomAgentFile)
}

/**
 * Filters an object of file paths/templates to only include valid custom agent templates.
 * 
 * @param agentTemplates - Object with file paths as keys
 * @returns Filtered object containing only valid custom agent templates
 */
export function filterCustomAgentTemplates<T>(
  agentTemplates: Record<string, T>
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(agentTemplates).filter(([filePath]) =>
      isCustomAgentFile(filePath)
    )
  )
}

/**
 * Extracts the agent ID from a TypeScript file name.
 * 
 * @param fileName - The TypeScript file name (e.g., 'my-agent.ts')
 * @returns The agent ID (e.g., 'my-agent')
 */
export function extractAgentIdFromFileName(fileName: string): string {
  return fileName.replace('.ts', '')
}
