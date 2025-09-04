import { z } from 'zod/v4'
import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'analyze_test_requirements'
export const analyzeTestRequirementsTool = {
  toolName,
  description: `Analyze what tests are needed for a code change and identify existing test patterns.

This tool addresses the critical 66% test handling failure rate by:
- Identifying existing test patterns in the project
- Determining what tests need to be written/updated
- Finding the correct test files and frameworks
- Providing specific guidance on test implementation

Use this BEFORE implementing any feature or bug fix to ensure proper test coverage.

Example:
${getToolCallString(toolName, {
  changeDescription: 'Add user authentication with login form',
  affectedFiles: ['src/components/LoginForm.tsx', 'src/services/authService.ts'],
  changeType: 'feature',
  testStrategy: 'unit'
})}`.trim(),
} satisfies ToolDescription

export interface AnalyzeTestRequirementsParams {
  changeDescription: string
  affectedFiles: string[]
  changeType: 'feature' | 'bugfix' | 'refactor' | 'performance' | 'breaking'
  testStrategy?: 'unit' | 'integration' | 'e2e' | 'all'
}

export interface TestRequirement {
  type: 'unit' | 'integration' | 'e2e'
  description: string
  targetFile: string
  testFile: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  exists: boolean
  needsUpdate: boolean
}

export interface TestFrameworkInfo {
  framework: 'jest' | 'vitest' | 'mocha' | 'playwright' | 'cypress' | 'unknown'
  configFiles: string[]
  testPatterns: string[]
  runCommand: string
  setupFiles: string[]
}

export interface TestAnalysisResult {
  requirements: TestRequirement[]
  framework: TestFrameworkInfo
  existingPatterns: {
    mockPatterns: string[]
    assertionStyles: string[]
    testStructure: string
  }
  recommendations: string[]
  criticalGaps: string[]
}

/**
 * Analyzes test requirements for code changes
 * This is critical for addressing the 66% test handling failure rate
 */
export async function analyzeTestRequirements(
  params: AnalyzeTestRequirementsParams,
  projectContext: any
): Promise<TestAnalysisResult> {
  
  // Detect test framework and patterns
  const framework = await detectTestFramework(projectContext)
  
  // Analyze what tests are needed
  const requirements = await generateTestRequirements(params, projectContext, framework)
  
  // Find existing test patterns
  const existingPatterns = await analyzeExistingTestPatterns(projectContext, framework)
  
  // Generate recommendations
  const recommendations = generateTestRecommendations(requirements, framework, existingPatterns)
  
  // Identify critical gaps
  const criticalGaps = identifyCriticalTestGaps(requirements, params.changeType)
  
  return {
    requirements,
    framework,
    existingPatterns,
    recommendations,
    criticalGaps
  }
}

async function detectTestFramework(projectContext: any): Promise<TestFrameworkInfo> {
  // Mock implementation - would analyze package.json and config files
  const packageJson = projectContext.packageJson || {}
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
  
  let framework: TestFrameworkInfo['framework'] = 'unknown'
  const configFiles: string[] = []
  const setupFiles: string[] = []
  
  if (dependencies.jest) {
    framework = 'jest'
    configFiles.push('jest.config.js', 'jest.config.ts', 'package.json')
    setupFiles.push('setupTests.js', 'setupTests.ts')
  } else if (dependencies.vitest) {
    framework = 'vitest'
    configFiles.push('vitest.config.js', 'vitest.config.ts', 'vite.config.js')
  } else if (dependencies.mocha) {
    framework = 'mocha'
    configFiles.push('.mocharc.json', 'mocha.opts')
  } else if (dependencies.playwright) {
    framework = 'playwright'
    configFiles.push('playwright.config.js', 'playwright.config.ts')
  } else if (dependencies.cypress) {
    framework = 'cypress'
    configFiles.push('cypress.json', 'cypress.config.js')
  }
  
  const testPatterns = getTestPatterns(framework)
  const runCommand = getRunCommand(framework, packageJson.scripts)
  
  return {
    framework,
    configFiles,
    testPatterns,
    runCommand,
    setupFiles
  }
}

function getTestPatterns(framework: TestFrameworkInfo['framework']): string[] {
  const basePatterns = ['**/*.test.*', '**/*.spec.*', '**/__tests__/**/*.*']
  
  switch (framework) {
    case 'jest':
    case 'vitest':
      return [...basePatterns, '**/*.test.{js,ts,jsx,tsx}', '**/*.spec.{js,ts,jsx,tsx}']
    case 'playwright':
      return ['**/*.test.{js,ts}', 'tests/**/*.{js,ts}', 'e2e/**/*.{js,ts}']
    case 'cypress':
      return ['cypress/integration/**/*.{js,ts}', 'cypress/e2e/**/*.{js,ts}']
    default:
      return basePatterns
  }
}

function getRunCommand(framework: TestFrameworkInfo['framework'], scripts: any = {}): string {
  if (scripts.test) return scripts.test
  
  switch (framework) {
    case 'jest':
      return 'jest'
    case 'vitest':
      return 'vitest run'
    case 'mocha':
      return 'mocha'
    case 'playwright':
      return 'playwright test'
    case 'cypress':
      return 'cypress run'
    default:
      return 'npm test'
  }
}

async function generateTestRequirements(
  params: AnalyzeTestRequirementsParams,
  projectContext: any,
  framework: TestFrameworkInfo
): Promise<TestRequirement[]> {
  
  const requirements: TestRequirement[] = []
  
  for (const filePath of params.affectedFiles) {
    // Determine what type of file this is
    const fileType = determineFileType(filePath)
    
    // Generate test requirements based on file type and change type
    const fileRequirements = generateRequirementsForFile(
      filePath,
      fileType,
      params.changeType,
      params.changeDescription,
      framework
    )
    
    requirements.push(...fileRequirements)
  }
  
  // Add integration tests for complex changes
  if (params.changeType === 'feature' && params.affectedFiles.length > 1) {
    requirements.push({
      type: 'integration',
      description: `Integration tests for ${params.changeDescription}`,
      targetFile: 'multiple',
      testFile: getIntegrationTestPath(params.changeDescription, framework),
      priority: 'high',
      exists: false,
      needsUpdate: false
    })
  }
  
  return requirements
}

function determineFileType(filePath: string): 'component' | 'service' | 'util' | 'api' | 'model' | 'other' {
  const path = filePath.toLowerCase()
  
  if (path.includes('/components/') || path.endsWith('component.')) return 'component'
  if (path.includes('/services/') || path.endsWith('service.')) return 'service'  
  if (path.includes('/utils/') || path.includes('/helpers/')) return 'util'
  if (path.includes('/api/') || path.includes('/routes/')) return 'api'
  if (path.includes('/models/') || path.includes('/schemas/')) return 'model'
  
  return 'other'
}

function generateRequirementsForFile(
  filePath: string,
  fileType: string,
  changeType: string,
  description: string,
  framework: TestFrameworkInfo
): TestRequirement[] {
  
  const requirements: TestRequirement[] = []
  const testFilePath = getTestFilePath(filePath, framework)
  
  // Unit tests are almost always needed
  requirements.push({
    type: 'unit',
    description: `Unit tests for ${description} in ${filePath}`,
    targetFile: filePath,
    testFile: testFilePath,
    priority: changeType === 'feature' || changeType === 'bugfix' ? 'critical' : 'high',
    exists: false, // Would check if file exists
    needsUpdate: true
  })
  
  // Component-specific tests
  if (fileType === 'component') {
    requirements.push({
      type: 'unit',
      description: `Component rendering and interaction tests`,
      targetFile: filePath,
      testFile: testFilePath,
      priority: 'high',
      exists: false,
      needsUpdate: true
    })
  }
  
  // API-specific tests
  if (fileType === 'api') {
    requirements.push({
      type: 'integration',
      description: `API endpoint integration tests`,
      targetFile: filePath,
      testFile: testFilePath.replace('.test.', '.integration.test.'),
      priority: 'critical',
      exists: false,
      needsUpdate: true
    })
  }
  
  return requirements
}

function getTestFilePath(filePath: string, framework: TestFrameworkInfo): string {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'))
  const filename = filePath.substring(filePath.lastIndexOf('/') + 1)
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'))
  const ext = filename.substring(filename.lastIndexOf('.'))
  
  // Different frameworks have different conventions
  switch (framework.framework) {
    case 'jest':
    case 'vitest':
      return `${dir}/__tests__/${nameWithoutExt}.test${ext}`
    default:
      return `${dir}/${nameWithoutExt}.test${ext}`
  }
}

function getIntegrationTestPath(description: string, framework: TestFrameworkInfo): string {
  const sanitized = description.toLowerCase().replace(/[^a-z0-9]/g, '-')
  
  switch (framework.framework) {
    case 'playwright':
      return `tests/${sanitized}.spec.ts`
    case 'cypress':
      return `cypress/e2e/${sanitized}.cy.ts`
    default:
      return `tests/integration/${sanitized}.test.ts`
  }
}

async function analyzeExistingTestPatterns(
  projectContext: any,
  framework: TestFrameworkInfo
) {
  // Mock implementation - would analyze existing test files
  return {
    mockPatterns: [
      'jest.mock()',
      'vi.mock()', 
      'sinon.stub()'
    ],
    assertionStyles: [
      'expect().toBe()',
      'expect().toEqual()',
      'expect().toHaveBeenCalled()'
    ],
    testStructure: 'describe/it blocks with beforeEach setup'
  }
}

function generateTestRecommendations(
  requirements: TestRequirement[],
  framework: TestFrameworkInfo,
  patterns: any
): string[] {
  const recommendations: string[] = []
  
  recommendations.push(`Use ${framework.framework} as the primary testing framework`)
  recommendations.push(`Run tests with: ${framework.runCommand}`)
  
  if (requirements.some(r => r.type === 'unit')) {
    recommendations.push(`Follow existing test structure: ${patterns.testStructure}`)
    recommendations.push(`Use consistent assertion style: ${patterns.assertionStyles[0]}`)
  }
  
  if (requirements.some(r => r.priority === 'critical')) {
    recommendations.push(`Critical tests must be implemented before deployment`)
  }
  
  const componentTests = requirements.filter(r => r.targetFile.includes('component'))
  if (componentTests.length > 0) {
    recommendations.push(`Test component rendering, props, and user interactions`)
    recommendations.push(`Consider using @testing-library for component tests`)
  }
  
  return recommendations
}

function identifyCriticalTestGaps(
  requirements: TestRequirement[],
  changeType: string
): string[] {
  const gaps: string[] = []
  
  const criticalRequirements = requirements.filter(r => r.priority === 'critical')
  if (criticalRequirements.length === 0 && changeType === 'feature') {
    gaps.push('No critical tests identified for new feature - this is a major risk')
  }
  
  const unitTests = requirements.filter(r => r.type === 'unit')
  if (unitTests.length === 0) {
    gaps.push('No unit tests planned - every code change should have unit tests')
  }
  
  const integrationTests = requirements.filter(r => r.type === 'integration')
  if (integrationTests.length === 0 && requirements.length > 2) {
    gaps.push('Consider integration tests for complex changes affecting multiple files')
  }
  
  return gaps
}
