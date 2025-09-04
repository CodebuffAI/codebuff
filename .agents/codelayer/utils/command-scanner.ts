import { readdirSync } from 'fs'
import { join } from 'path'

/**
 * Command mapping with file and trigger phrases
 */
export interface CommandMapping {
  /** Display name derived from filename */
  displayName: string
  /** Base filename without extension */
  filename: string
  /** Generated trigger phrases based on filename */
  triggers: string[]
  /** Full file path */
  filePath: string
}

/**
 * Generate trigger phrases from a filename
 * e.g., "create_plan" -> ["create plan", "plan", "make plan"]
 */
function generateTriggerPhrases(filename: string): string[] {
  const base = filename.replace(/[-_]/g, ' ').toLowerCase()
  const triggers = [base]
  
  // Add the original filename as a trigger too
  if (filename !== base) {
    triggers.push(filename)
  }
  
  // Generate common variations based on common patterns
  const words = base.split(' ')
  
  // For multi-word commands, add shortened versions
  if (words.length > 1) {
    // Add just the main noun (last word)
    const mainWord = words[words.length - 1]
    if (mainWord.length > 3) {
      triggers.push(mainWord)
    }
    
    // Add verb variations for action commands
    const firstWord = words[0]
    if (['create', 'make', 'build', 'generate'].includes(firstWord)) {
      triggers.push(`make ${words.slice(1).join(' ')}`)
      triggers.push(`build ${words.slice(1).join(' ')}`)
    }
    
    if (['implement', 'execute', 'run'].includes(firstWord)) {
      triggers.push(`execute ${words.slice(1).join(' ')}`)
      triggers.push(`run ${words.slice(1).join(' ')}`)
    }
    
    if (['describe', 'show', 'display'].includes(firstWord)) {
      triggers.push(`show ${words.slice(1).join(' ')}`)
    }
    
    if (['validate', 'check', 'verify'].includes(firstWord)) {
      triggers.push(`check ${words.slice(1).join(' ')}`)
      triggers.push(`verify ${words.slice(1).join(' ')}`)
    }
    
    if (['research', 'explore', 'investigate'].includes(firstWord)) {
      triggers.push(`explore ${words.slice(1).join(' ')}`)
      triggers.push(`investigate ${words.slice(1).join(' ')}`)
    }
  }
  
  // Add common abbreviations and synonyms
  const commonSynonyms: Record<string, string[]> = {
    'pr': ['pull request'],
    'commit': ['git commit', 'save changes'],
    'debug': ['debugging', 'troubleshoot'],
    'worktree': ['new worktree'],
    'review': ['code review'],
    'ticket': ['create ticket'],
    'plan': ['implementation plan']
  }
  
  for (const [key, synonyms] of Object.entries(commonSynonyms)) {
    if (base.includes(key)) {
      triggers.push(...synonyms)
    }
  }
  
  return [...new Set(triggers)]
}

/**
 * Convert filename to display name
 * e.g., "create_plan" -> "Create Plan"
 */
function filenameToDisplayName(filename: string): string {
  return filename
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Scan commands directory and return command mappings
 */
export function scanCommandsDirectory(commandsDir: string): CommandMapping[] {
  try {
    const files = readdirSync(commandsDir)
    const markdownFiles = files.filter(file => file.endsWith('.md'))
    
    return markdownFiles.map(file => {
      const filename = file.replace('.md', '')
      return {
        displayName: filenameToDisplayName(filename),
        filename,
        triggers: generateTriggerPhrases(filename),
        filePath: `.agents/dex/commands/${file}`
      }
    }).sort((a, b) => a.displayName.localeCompare(b.displayName))
  } catch (error) {
    console.warn('Could not scan commands directory:', error)
    return []
  }
}

/**
 * Generate the Available Commands section for system prompt
 */
export function generateCommandsSection(commands: CommandMapping[]): string {
  if (commands.length === 0) {
    return 'No commands available.'
  }
  
  const commandLines = commands.map(cmd => {
    const triggerList = cmd.triggers.map(t => `\"${t}\"`).join(', ')
    return `- **${cmd.displayName}**: ${triggerList} → Read \\\`${cmd.filePath}\\\``
  })
  
  return `### Available Commands\n\nWhen users mention these trigger phrases, read the corresponding command file and execute the prompt:\n\n${commandLines.join('\\n')}`
}
