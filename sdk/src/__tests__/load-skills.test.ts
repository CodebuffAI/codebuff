import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'

import {
  SKILL_FILE_NAME,
  SKILL_NAME_MAX_LENGTH,
} from '@codebuff/common/constants/skills'

import { loadSkills } from '../skills/load-skills'

const writeSkill = ({
  skillsRoot,
  skillDirName,
  frontmatterName = skillDirName,
  description = `Description for ${skillDirName}`,
  body = `# ${skillDirName}\n`,
}: {
  skillsRoot: string
  skillDirName: string
  frontmatterName?: string
  description?: string
  body?: string
}): string => {
  const skillDir = path.join(skillsRoot, skillDirName)
  const skillFile = path.join(skillDir, SKILL_FILE_NAME)

  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    skillFile,
    [
      '---',
      `name: ${frontmatterName}`,
      `description: ${description}`,
      '---',
      '',
      body,
    ].join('\n'),
    'utf8',
  )

  return skillFile
}

describe('loadSkills', () => {
  let tempRoot: string
  let homeDir: string
  let projectDir: string

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'codebuff-sdk-load-skills-'))
    homeDir = path.join(tempRoot, 'home')
    projectDir = path.join(tempRoot, 'project')

    mkdirSync(homeDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })

    spyOn(os, 'homedir').mockReturnValue(homeDir)
  })

  afterEach(() => {
    mock.restore()
    rmSync(tempRoot, { recursive: true, force: true })
  })

  test('discovers valid skills from all default search roots', async () => {
    writeSkill({
      skillsRoot: path.join(homeDir, '.claude', 'skills'),
      skillDirName: 'global-claude-skill',
    })
    writeSkill({
      skillsRoot: path.join(homeDir, '.agents', 'skills'),
      skillDirName: 'global-agents-skill',
    })
    writeSkill({
      skillsRoot: path.join(projectDir, '.claude', 'skills'),
      skillDirName: 'project-claude-skill',
    })
    writeSkill({
      skillsRoot: path.join(projectDir, '.agents', 'skills'),
      skillDirName: 'project-agents-skill',
    })

    const skills = await loadSkills({ cwd: projectDir })

    expect(Object.keys(skills).sort()).toEqual([
      'global-agents-skill',
      'global-claude-skill',
      'project-agents-skill',
      'project-claude-skill',
    ])
    expect(skills['global-claude-skill']?.filePath).toBe(
      path.join(homeDir, '.claude', 'skills', 'global-claude-skill', 'SKILL.md'),
    )
    expect(skills['project-agents-skill']?.description).toBe(
      'Description for project-agents-skill',
    )
  })

  test('loads skills from an explicit skillsPath only', async () => {
    const explicitSkillsDir = path.join(tempRoot, 'custom-skills')

    writeSkill({
      skillsRoot: explicitSkillsDir,
      skillDirName: 'custom-skill',
      description: 'Loaded from explicit skillsPath',
    })
    writeSkill({
      skillsRoot: path.join(projectDir, '.agents', 'skills'),
      skillDirName: 'project-skill',
      description: 'Should be ignored when skillsPath is set',
    })

    const skills = await loadSkills({
      cwd: projectDir,
      skillsPath: explicitSkillsDir,
    })

    expect(Object.keys(skills)).toEqual(['custom-skill'])
    expect(skills['custom-skill']?.description).toBe(
      'Loaded from explicit skillsPath',
    )
  })

  test('applies override precedence as project over global and .agents over .claude', async () => {
    writeSkill({
      skillsRoot: path.join(homeDir, '.claude', 'skills'),
      skillDirName: 'shared-skill',
      description: 'global claude',
    })
    writeSkill({
      skillsRoot: path.join(homeDir, '.agents', 'skills'),
      skillDirName: 'shared-skill',
      description: 'global agents',
    })
    writeSkill({
      skillsRoot: path.join(projectDir, '.claude', 'skills'),
      skillDirName: 'shared-skill',
      description: 'project claude',
    })
    writeSkill({
      skillsRoot: path.join(projectDir, '.agents', 'skills'),
      skillDirName: 'shared-skill',
      description: 'project agents',
    })

    const skills = await loadSkills({ cwd: projectDir })

    expect(skills['shared-skill']?.description).toBe('project agents')
    expect(skills['shared-skill']?.filePath).toBe(
      path.join(projectDir, '.agents', 'skills', 'shared-skill', 'SKILL.md'),
    )
  })

  test('prefers project .claude skills over global .agents skills', async () => {
    writeSkill({
      skillsRoot: path.join(homeDir, '.agents', 'skills'),
      skillDirName: 'priority-skill',
      description: 'global agents',
    })
    writeSkill({
      skillsRoot: path.join(projectDir, '.claude', 'skills'),
      skillDirName: 'priority-skill',
      description: 'project claude',
    })

    const skills = await loadSkills({ cwd: projectDir })

    expect(skills['priority-skill']?.description).toBe('project claude')
  })

  test('skips invalid skill directories and malformed skill definitions', async () => {
    const skillsRoot = path.join(projectDir, '.agents', 'skills')
    const consoleError = spyOn(console, 'error').mockImplementation(() => { })
    const consoleWarn = spyOn(console, 'warn').mockImplementation(() => { })

    mkdirSync(path.join(skillsRoot, 'missing-skill-file'), { recursive: true })

    const malformedDir = path.join(skillsRoot, 'malformed-frontmatter')
    mkdirSync(malformedDir, { recursive: true })
    writeFileSync(
      path.join(malformedDir, 'SKILL.md'),
      ['---', '{invalid yaml: [unclosed', '---'].join('\n'),
      'utf8',
    )

    writeSkill({
      skillsRoot,
      skillDirName: 'mismatch-dir',
      frontmatterName: 'different-name',
      description: 'Mismatched name',
    })

    const tooLongName = 'a'.repeat(SKILL_NAME_MAX_LENGTH + 1)
    writeSkill({
      skillsRoot,
      skillDirName: tooLongName,
      description: 'Too long',
    })

    writeSkill({
      skillsRoot,
      skillDirName: 'Uppercase-Skill',
      description: 'Uppercase invalid',
    })
    writeSkill({
      skillsRoot,
      skillDirName: 'special_skill',
      description: 'Special char invalid',
    })
    writeSkill({
      skillsRoot,
      skillDirName: 'valid-skill',
      description: 'Valid skill',
    })

    const skills = await loadSkills({ cwd: projectDir, verbose: true })

    expect(Object.keys(skills)).toEqual(['valid-skill'])
    expect(skills['valid-skill']?.description).toBe('Valid skill')

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid frontmatter in skill file'),
    )
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        "Skill name 'different-name' does not match directory name 'mismatch-dir'",
      ),
    )
    expect(consoleWarn).toHaveBeenCalledWith(
      `Skipping invalid skill directory name: ${tooLongName}`,
    )
    expect(consoleWarn).toHaveBeenCalledWith(
      'Skipping invalid skill directory name: Uppercase-Skill',
    )
    expect(consoleWarn).toHaveBeenCalledWith(
      'Skipping invalid skill directory name: special_skill',
    )
  })

  test('loads skills from skillsPath and bypasses default search roots', async () => {
    const customSkillsDir = path.join(tempRoot, 'custom-skills')
    mkdirSync(customSkillsDir, { recursive: true })

    // Put a skill in a default root that should NOT be found
    writeSkill({
      skillsRoot: path.join(projectDir, '.agents', 'skills'),
      skillDirName: 'default-skill',
      description: 'Should not be found',
    })

    // Put a skill in the custom directory that SHOULD be found
    writeSkill({
      skillsRoot: customSkillsDir,
      skillDirName: 'custom-skill',
      description: 'Found via skillsPath',
    })

    const skills = await loadSkills({
      cwd: projectDir,
      skillsPath: customSkillsDir,
    })

    expect(Object.keys(skills).sort()).toEqual(['custom-skill'])
    expect(skills['custom-skill']?.description).toBe('Found via skillsPath')
    expect(skills['custom-skill']?.filePath).toBe(
      path.join(customSkillsDir, 'custom-skill', 'SKILL.md'),
    )
  })
})
