import { z } from 'zod/v4'
import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'create_task_checklist'
export const createTaskChecklistTool = {
  toolName,
  description: `Break down a user request into a comprehensive checklist of all requirements that must be completed.

This tool analyzes the user's request and creates a detailed checklist ensuring no requirements are missed.
Use this at the start of complex tasks to ensure complete implementation.

Key benefits:
- Prevents incomplete implementations (major issue in evaluations)
- Ensures all parts of multi-step tasks are addressed
- Provides clear progress tracking
- Catches secondary requirements like tests, documentation, schema updates

Example:
${getToolCallString(toolName, {
  userRequest: 'Add user authentication with login form and tests',
  projectContext: {
    hasTests: true,
    hasSchema: false,
    hasMigrations: true,
    hasChangelog: true,
    framework: 'React'
  },
  complexity: 'moderate'
})}`.trim(),
} satisfies ToolDescription

// Parameter types for the checklist system
export interface CreateTaskChecklistParams {
  userRequest: string
  projectContext: {
    hasTests: boolean
    hasSchema: boolean
    hasMigrations: boolean
    hasChangelog: boolean
    framework?: string
    buildTool?: string
  }
  complexity: 'simple' | 'moderate' | 'complex'
}

// Types for the checklist system
export interface TaskChecklistItem {
  id: string
  title: string
  description: string
  category: 'implementation' | 'testing' | 'documentation' | 'validation' | 'cleanup'
  priority: 'critical' | 'high' | 'medium' | 'low'
  estimatedComplexity: 'simple' | 'moderate' | 'complex'
  dependencies: string[]
  completed: boolean
  notes?: string
}

export interface TaskChecklist {
  id: string
  userRequest: string
  createdAt: string
  items: TaskChecklistItem[]
  totalItems: number
  completedItems: number
  progress: number
}

/**
 * Analyzes a user request and generates a comprehensive checklist
 * This addresses the major issue of incomplete implementations
 */
export function generateTaskChecklist(params: CreateTaskChecklistParams): TaskChecklist {
  const { userRequest, projectContext, complexity } = params
  
  const checklistId = `checklist_${Date.now()}`
  const items: TaskChecklistItem[] = []
  
  // Analyze request for different types of work needed
  const analysisResult = analyzeUserRequest(userRequest, projectContext)
  
  // Core implementation items
  items.push(...generateImplementationItems(analysisResult, complexity))
  
  // Testing requirements (critical gap from evaluations)
  if (projectContext.hasTests && analysisResult.needsTesting) {
    items.push(...generateTestingItems(analysisResult, complexity))
  }
  
  // Documentation and schema updates
  items.push(...generateDocumentationItems(analysisResult, projectContext))
  
  // Validation and cleanup items
  items.push(...generateValidationItems(analysisResult, projectContext))
  
  // Add dependencies between items
  addItemDependencies(items)
  
  return {
    id: checklistId,
    userRequest,
    createdAt: new Date().toISOString(),
    items,
    totalItems: items.length,
    completedItems: 0,
    progress: 0
  }
}

interface RequestAnalysis {
  type: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'test' | 'config'
  scope: 'frontend' | 'backend' | 'fullstack' | 'database' | 'config' | 'unknown'
  needsTesting: boolean
  needsSchemaUpdate: boolean
  needsMigration: boolean
  affectedComponents: string[]
  keywords: string[]
}

function analyzeUserRequest(request: string, context: any): RequestAnalysis {
  const lowerRequest = request.toLowerCase()
  
  // Determine type
  let type: RequestAnalysis['type'] = 'feature'
  if (lowerRequest.includes('fix') || lowerRequest.includes('bug')) type = 'bugfix'
  else if (lowerRequest.includes('refactor') || lowerRequest.includes('restructure')) type = 'refactor'
  else if (lowerRequest.includes('document') || lowerRequest.includes('readme')) type = 'documentation'
  else if (lowerRequest.includes('test')) type = 'test'
  else if (lowerRequest.includes('config')) type = 'config'
  
  // Determine scope
  let scope: RequestAnalysis['scope'] = 'unknown'
  if (lowerRequest.includes('frontend') || lowerRequest.includes('ui') || lowerRequest.includes('component')) scope = 'frontend'
  else if (lowerRequest.includes('backend') || lowerRequest.includes('api') || lowerRequest.includes('server')) scope = 'backend'
  else if (lowerRequest.includes('database') || lowerRequest.includes('migration')) scope = 'database'
  else if (lowerRequest.includes('config')) scope = 'config'
  else if (lowerRequest.includes('full') || (lowerRequest.includes('frontend') && lowerRequest.includes('backend'))) scope = 'fullstack'
  
  // Determine if schema/migration updates needed
  const needsSchemaUpdate = lowerRequest.includes('schema') || 
                           lowerRequest.includes('model') ||
                           lowerRequest.includes('field') ||
                           lowerRequest.includes('table')
  
  const needsMigration = needsSchemaUpdate || 
                        lowerRequest.includes('migration') ||
                        lowerRequest.includes('alter table')
  
  // Determine if testing is needed
  const needsTesting = type === 'feature' || 
                      type === 'bugfix' || 
                      lowerRequest.includes('test')
  
  // Extract keywords for better understanding
  const keywords = extractKeywords(request)
  
  return {
    type,
    scope,
    needsTesting,
    needsSchemaUpdate,
    needsMigration,
    affectedComponents: [],
    keywords
  }
}

function generateImplementationItems(analysis: RequestAnalysis, complexity: string): TaskChecklistItem[] {
  const items: TaskChecklistItem[] = []
  
  // Core implementation
  items.push({
    id: 'impl_core',
    title: 'Implement core functionality',
    description: 'Implement the main feature or change requested',
    category: 'implementation',
    priority: 'critical',
    estimatedComplexity: complexity as any,
    dependencies: [],
    completed: false
  })
  
  // Frontend specific
  if (analysis.scope === 'frontend' || analysis.scope === 'fullstack') {
    items.push({
      id: 'impl_frontend',
      title: 'Update frontend components',
      description: 'Implement UI changes and component updates',
      category: 'implementation', 
      priority: 'high',
      estimatedComplexity: complexity as any,
      dependencies: ['impl_core'],
      completed: false
    })
  }
  
  // Backend specific
  if (analysis.scope === 'backend' || analysis.scope === 'fullstack') {
    items.push({
      id: 'impl_backend',
      title: 'Update backend logic',
      description: 'Implement server-side changes and API updates',
      category: 'implementation',
      priority: 'high', 
      estimatedComplexity: complexity as any,
      dependencies: ['impl_core'],
      completed: false
    })
  }
  
  // Database changes
  if (analysis.needsMigration) {
    items.push({
      id: 'impl_migration',
      title: 'Create database migration',
      description: 'Create and run database migration for schema changes',
      category: 'implementation',
      priority: 'critical',
      estimatedComplexity: 'moderate' as any,
      dependencies: [],
      completed: false
    })
  }
  
  return items
}

function generateTestingItems(analysis: RequestAnalysis, complexity: string): TaskChecklistItem[] {
  const items: TaskChecklistItem[] = []
  
  // Unit tests
  items.push({
    id: 'test_unit',
    title: 'Write/update unit tests',
    description: 'Create or update unit tests for the new functionality',
    category: 'testing',
    priority: 'high',
    estimatedComplexity: complexity as any,
    dependencies: ['impl_core'],
    completed: false
  })
  
  // Integration tests for complex features
  if (complexity === 'complex') {
    items.push({
      id: 'test_integration', 
      title: 'Write integration tests',
      description: 'Create integration tests for complex workflows',
      category: 'testing',
      priority: 'medium',
      estimatedComplexity: 'moderate' as any,
      dependencies: ['test_unit'],
      completed: false
    })
  }
  
  // Run tests validation
  items.push({
    id: 'test_validate',
    title: 'Run and validate all tests',
    description: 'Execute test suite and ensure all tests pass',
    category: 'validation',
    priority: 'critical',
    estimatedComplexity: 'simple' as any,
    dependencies: ['test_unit'],
    completed: false
  })
  
  return items
}

function generateDocumentationItems(analysis: RequestAnalysis, context: any): TaskChecklistItem[] {
  const items: TaskChecklistItem[] = []
  
  // Schema updates
  if (analysis.needsSchemaUpdate && context.hasSchema) {
    items.push({
      id: 'doc_schema',
      title: 'Update schema files',
      description: 'Update schema.graphql or other schema files',
      category: 'documentation',
      priority: 'high',
      estimatedComplexity: 'simple' as any,
      dependencies: ['impl_core'],
      completed: false
    })
  }
  
  // Changelog updates
  if (context.hasChangelog) {
    items.push({
      id: 'doc_changelog',
      title: 'Update CHANGELOG.md',
      description: 'Add entry to changelog documenting the changes',
      category: 'documentation',
      priority: 'medium',
      estimatedComplexity: 'simple' as any,
      dependencies: ['impl_core'],
      completed: false
    })
  }
  
  return items
}

function generateValidationItems(analysis: RequestAnalysis, context: any): TaskChecklistItem[] {
  const items: TaskChecklistItem[] = []
  
  // Build validation
  items.push({
    id: 'val_build',
    title: 'Verify build passes',
    description: 'Run build command and ensure no compilation errors',
    category: 'validation',
    priority: 'critical',
    estimatedComplexity: 'simple' as any,
    dependencies: ['impl_core'],
    completed: false
  })
  
  // Linting
  items.push({
    id: 'val_lint',
    title: 'Fix linting issues',
    description: 'Run linter and fix any code style issues',
    category: 'validation',
    priority: 'medium',
    estimatedComplexity: 'simple' as any,
    dependencies: ['impl_core'],
    completed: false
  })
  
  // Type checking
  items.push({
    id: 'val_types',
    title: 'Verify type checking',
    description: 'Run type checker and fix any type errors',
    category: 'validation',
    priority: 'high',
    estimatedComplexity: 'simple' as any,
    dependencies: ['impl_core'],
    completed: false
  })
  
  return items
}

function addItemDependencies(items: TaskChecklistItem[]) {
  // Implementation items should generally come before testing
  const implItems = items.filter(i => i.category === 'implementation')
  const testItems = items.filter(i => i.category === 'testing')
  
  testItems.forEach(testItem => {
    if (!testItem.dependencies.some(dep => implItems.some(impl => impl.id === dep))) {
      testItem.dependencies.push(...implItems.map(i => i.id))
    }
  })
}

function extractKeywords(request: string): string[] {
  // Simple keyword extraction - could be enhanced with NLP
  const words = request.toLowerCase().match(/\b\w+\b/g) || []
  const importantWords = words.filter(word => 
    word.length > 3 && 
    !['that', 'this', 'with', 'from', 'they', 'have', 'will', 'been', 'were'].includes(word)
  )
  return [...new Set(importantWords)]
}
