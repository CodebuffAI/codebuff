import { expect, test } from 'bun:test'
import {
  accountSkillsUploadSchema,
  encodeAccountSkillsUpload,
  ACCOUNT_SKILLS_UPLOAD_MAX_BYTES,
} from './skills-transfer'
import { invalidSkillsRefusal } from './project-settings'

test('skill uploads preserve Unicode, code, resources and revisions for new and old clients', () => {
  const snapshot = {
    revision: 7,
    settings: {
      skills: [
        {
          name: 'review',
          description: 'Review 日本語 🧪',
          instructions: 'Review <script> examples and SELECT * FROM users;',
          files: [
            {
              path: 'references/code.ts',
              contents: 'export const hello = "你好"\n'.repeat(2500),
            },
          ],
        },
      ],
    },
  }
  const upload = encodeAccountSkillsUpload(snapshot)
  expect(JSON.stringify(upload)).not.toContain('<script>')
  expect(accountSkillsUploadSchema.parse(upload)).toEqual(snapshot)
  expect(accountSkillsUploadSchema.parse(snapshot)).toEqual(snapshot)
})

test('encoded uploads still reject malformed packages, unsafe paths, and oversized decoded libraries', () => {
  const wrap = (value: unknown) => ({
    encoding: 'base64',
    data: btoa(JSON.stringify(value)),
  })
  const skill = {
    name: 'review',
    description: 'Review',
    instructions: 'Review',
  }
  for (const value of [
    { encoding: 'base64', data: '!' },
    { encoding: 'base64', data: btoa('not json') },
    { encoding: 'base64', data: '/w==' }, // Invalid UTF-8.
    {
      encoding: 'base64',
      data: 'a'.repeat(ACCOUNT_SKILLS_UPLOAD_MAX_BYTES + 1),
    },
    wrap({ revision: -1, settings: { skills: [] } }),
    wrap({ revision: 0, settings: { skills: [skill, skill] } }),
    wrap({
      revision: 0,
      settings: {
        skills: [{ ...skill, files: [{ path: '../escape', contents: '' }] }],
      },
    }),
    wrap({
      revision: 0,
      settings: {
        skills: [
          {
            ...skill,
            files: Array.from({ length: 26 }, (_, i) => ({
              path: `file-${i}`,
              contents: 'x'.repeat(100000),
            })),
          },
        ],
      },
    }),
  ])
    expect(accountSkillsUploadSchema.safeParse(value).success).toBe(false)
})

// The route parses this union, so its refusal has to survive one: zod reports
// a failed union as a single issue carrying every branch's issues, and the
// branch that complained least is the upload the client was actually sending.
test('a refused upload is reported from the branch it came closest to', () => {
  const skill = {
    name: 'review',
    description: 'Review',
    instructions: 'Read the diff.',
  }
  const refusalFor = (value: unknown) => {
    const parsed = accountSkillsUploadSchema.safeParse(value)
    expect(parsed.success).toBe(false)
    return parsed.success ? '' : invalidSkillsRefusal(parsed.error, value)
  }
  // An encoding fault belongs to the encoded branch, not to the plain one's
  // missing `revision`.
  expect(refusalFor({ encoding: 'base64', data: '!' })).toBe(
    'Invalid skills: the request body was rejected (Invalid skill package encoding). Please report this if it keeps happening.',
  )
  // A decoded package is still reported by skill and field; the name cannot be
  // quoted through base64, so the position stands in for it.
  expect(
    refusalFor({
      encoding: 'base64',
      data: btoa(
        JSON.stringify({
          revision: 1,
          settings: {
            skills: [skill, { ...skill, name: 'other', instructions: ' ' }],
          },
        }),
      ),
    }),
  ).toBe(
    'The skill at index 1 cannot be saved: field "instructions" was rejected (too_small). Fix it and save again.',
  )
  expect(
    refusalFor({
      revision: 1,
      settings: {
        skills: [{ ...skill, files: [{ path: '../escape', contents: '' }] }],
      },
    }),
  ).toBe(
    'Skill "review" cannot be saved: field "files[0].path" was rejected (Invalid skill resource path). Fix it and save again.',
  )
})
