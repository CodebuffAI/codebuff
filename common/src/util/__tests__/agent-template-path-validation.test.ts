import { validateAgentTemplateConfigs } from '../agent-template-validation'
import { AGENT_TEMPLATES_DIR } from '../../constants'

describe('validateAgentTemplateConfigs - Path Validation', () => {
  const validOverrideTemplate = {
    id: 'reviewer',
    version: '1.0.0',
    override: true,
    systemPrompt: {
      type: 'append',
      path: './system-prompt.md'
    }
  }

  const validDynamicTemplate = {
    id: 'test-agent',
    version: '1.0.0',
    override: false,
    name: 'Test Agent',
    description: 'A test agent',
    model: 'anthropic/claude-4-sonnet-20250522',
    systemPrompt: {
      path: './prompts/system.md'
    },
    userInputPrompt: 'Test prompt',
    agentStepPrompt: 'Test step prompt'
  }

  it('should accept valid relative paths within agent templates directory', () => {
    const agentTemplates = {
      [`${AGENT_TEMPLATES_DIR}test-override.json`]: JSON.stringify(validOverrideTemplate),
      [`${AGENT_TEMPLATES_DIR}test-dynamic.json`]: JSON.stringify(validDynamicTemplate)
    }

    const result = validateAgentTemplateConfigs(agentTemplates)
    
    expect(result.validationErrors).toHaveLength(0)
    expect(result.validConfigs).toHaveLength(2)
  })

  it('should reject paths that escape the agent templates directory with ../', () => {
    const invalidOverride = {
      ...validOverrideTemplate,
      systemPrompt: {
        type: 'append',
        path: '../../../etc/passwd'
      }
    }

    const agentTemplates = {
      [`${AGENT_TEMPLATES_DIR}invalid.json`]: JSON.stringify(invalidOverride)
    }

    const result = validateAgentTemplateConfigs(agentTemplates)
    
    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0].message).toContain('outside the .agents/templates/ directory')
    expect(result.validConfigs).toHaveLength(0)
  })

  it('should reject absolute paths', () => {
    const invalidDynamic = {
      ...validDynamicTemplate,
      systemPrompt: {
        path: '/etc/passwd'
      }
    }

    const agentTemplates = {
      [`${AGENT_TEMPLATES_DIR}invalid.json`]: JSON.stringify(invalidDynamic)
    }

    const result = validateAgentTemplateConfigs(agentTemplates)
    
    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0].message).toContain('absolute path')
    expect(result.validConfigs).toHaveLength(0)
  })

  it('should reject paths with multiple ../ sequences', () => {
    const invalidOverride = {
      ...validOverrideTemplate,
      userInputPrompt: {
        type: 'prepend',
        path: '../../backend/src/secret.ts'
      }
    }

    const agentTemplates = {
      [`${AGENT_TEMPLATES_DIR}invalid.json`]: JSON.stringify(invalidOverride)
    }

    const result = validateAgentTemplateConfigs(agentTemplates)
    
    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0].message).toContain('outside the .agents/templates/ directory')
    expect(result.validConfigs).toHaveLength(0)
  })

  it('should accept paths to subdirectories within agent templates', () => {
    const validSubdirTemplate = {
      ...validOverrideTemplate,
      systemPrompt: {
        type: 'append',
        path: './prompts/subfolder/system.md'
      }
    }

    const agentTemplates = {
      [`${AGENT_TEMPLATES_DIR}valid-subdir.json`]: JSON.stringify(validSubdirTemplate)
    }

    const result = validateAgentTemplateConfigs(agentTemplates)
    
    expect(result.validationErrors).toHaveLength(0)
    expect(result.validConfigs).toHaveLength(1)
  })

  it('should validate multiple prompt fields in dynamic templates', () => {
    const templateWithMultiplePaths = {
      ...validDynamicTemplate,
      systemPrompt: { path: './system.md' },
      userInputPrompt: { path: './user-input.md' },
      agentStepPrompt: { path: './agent-step.md' },
      initialAssistantMessage: { path: '../../../invalid.md' } // This should fail
    }

    const agentTemplates = {
      [`${AGENT_TEMPLATES_DIR}multi-path.json`]: JSON.stringify(templateWithMultiplePaths)
    }

    const result = validateAgentTemplateConfigs(agentTemplates)
    
    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0].message).toContain('Invalid initialAssistantMessage path')
    expect(result.validConfigs).toHaveLength(0)
  })

  it('should allow templates without path fields', () => {
    const templateWithoutPaths = {
      ...validDynamicTemplate,
      systemPrompt: 'Direct string content',
      userInputPrompt: 'Direct user input prompt',
      agentStepPrompt: 'Direct agent step prompt'
    }

    const agentTemplates = {
      [`${AGENT_TEMPLATES_DIR}no-paths.json`]: JSON.stringify(templateWithoutPaths)
    }

    const result = validateAgentTemplateConfigs(agentTemplates)
    
    expect(result.validationErrors).toHaveLength(0)
    expect(result.validConfigs).toHaveLength(1)
  })

  it('should handle mixed valid and invalid templates', () => {
    const validTemplate = {
      ...validOverrideTemplate,
      systemPrompt: {
        type: 'append',
        path: './valid.md'
      }
    }

    const invalidTemplate = {
      ...validOverrideTemplate,
      id: 'another-reviewer',
      systemPrompt: {
        type: 'append',
        path: '../../../invalid.md'
      }
    }

    const agentTemplates = {
      [`${AGENT_TEMPLATES_DIR}valid.json`]: JSON.stringify(validTemplate),
      [`${AGENT_TEMPLATES_DIR}invalid.json`]: JSON.stringify(invalidTemplate)
    }

    const result = validateAgentTemplateConfigs(agentTemplates)
    
    expect(result.validationErrors).toHaveLength(1)
    expect(result.validConfigs).toHaveLength(1)
    expect(result.validConfigs[0].filePath).toBe(`${AGENT_TEMPLATES_DIR}valid.json`)
  })
})
