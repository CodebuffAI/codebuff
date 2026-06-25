import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { handleSkill } from '../skill'

import type { ProjectFileContext } from '@codebuff/common/util/file'

function writeSkill(projectRoot: string, name: string, description: string) {
  const skillDir = path.join(projectRoot, '.claude', 'skills', name)
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\nbody for ${description}\n`,
  )
}

function callSkill(name: string, fileContext: Partial<ProjectFileContext>) {
  return handleSkill({
    previousToolCallFinished: Promise.resolve(),
    toolCall: { toolName: 'skill', input: { name } } as any,
    fileContext: fileContext as ProjectFileContext,
  })
}

describe('handleSkill', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-'))
  })

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  })

  it('loads a skill installed during the session from disk', async () => {
    writeSkill(projectRoot, 'demo', 'installed at runtime')

    const { output } = await callSkill('demo', { projectRoot, skills: {} })
    const value = (output as any)[0].value

    expect(value.name).toBe('demo')
    expect(value.description).toBe('installed at runtime')
    expect(value.content).toContain('body for installed at runtime')
  })

  it('prefers the on-disk copy over a stale pre-loaded cache', async () => {
    writeSkill(projectRoot, 'demo', 'fresh on disk')

    const { output } = await callSkill('demo', {
      projectRoot,
      skills: {
        demo: {
          name: 'demo',
          description: 'stale cached',
          content: 'old cached body',
          filePath: '/nonexistent/SKILL.md',
        },
      },
    })
    const value = (output as any)[0].value

    expect(value.description).toBe('fresh on disk')
    expect(value.content).toContain('body for fresh on disk')
  })

  it('falls back to the cache when the skill is not on disk', async () => {
    const { output } = await callSkill('demo', {
      projectRoot,
      skills: {
        demo: {
          name: 'demo',
          description: 'cache only',
          content: 'cached body',
          filePath: '/nonexistent/SKILL.md',
        },
      },
    })
    const value = (output as any)[0].value

    expect(value.description).toBe('cache only')
    expect(value.content).toBe('cached body')
  })

  it('returns a not-found error when the skill is missing everywhere', async () => {
    const { output } = await callSkill('missing', { projectRoot, skills: {} })
    const value = (output as any)[0].value

    expect(value.content).toContain("Skill 'missing' not found")
  })
})
