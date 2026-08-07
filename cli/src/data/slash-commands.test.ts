import { describe, expect, test } from 'bun:test'

import { getSlashCommandsWithSkills } from './slash-commands'

describe('getSlashCommandsWithSkills', () => {
  test('keeps user-only skills in the composer for additional context', () => {
    const commands = getSlashCommandsWithSkills({
      interview: {
        name: 'interview',
        description: 'Ask questions before implementing',
        content: 'Interview instructions',
        disableModelInvocation: true,
        filePath: '/skills/interview/SKILL.md',
      },
    })

    expect(
      commands.find((command) => command.id === 'skill:interview'),
    ).toMatchObject({
      label: 'skill:interview',
      insertText: '/skill:interview ',
    })
  })
})
