import { expect, test, beforeEach, afterEach } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  WorktreeArgsSchema as InitSchema,
  validateArgs as validateInitArgs,
} from '../init-worktree'
import {
  WorktreeArgsSchema as CleanupSchema,
  validateArgs as validateCleanupArgs,
  getWorktreePorts,
  WORKTREES_DIR,
} from '../cleanup-worktree'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'wt-'))
})

afterEach(() => {
  if (existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// init-worktree.ts: WorktreeArgsSchema + validateArgs
// ---------------------------------------------------------------------------

test('init WorktreeArgsSchema accepts valid name + port', () => {
  const result = InitSchema.safeParse({
    name: 'feature-branch',
    backendPort: 8001,
  })
  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.data.name).toBe('feature-branch')
    expect(result.data.backendPort).toBe(8001)
  }
})

test('init WorktreeArgsSchema rejects empty name', () => {
  const result = InitSchema.safeParse({ name: '', backendPort: 8001 })
  expect(result.success).toBe(false)
})

test('init WorktreeArgsSchema rejects name over 50 chars', () => {
  const result = InitSchema.safeParse({
    name: 'a'.repeat(51),
    backendPort: 8001,
  })
  expect(result.success).toBe(false)
})

test('init WorktreeArgsSchema rejects name with disallowed characters (spaces)', () => {
  const result = InitSchema.safeParse({
    name: 'feature branch',
    backendPort: 8001,
  })
  expect(result.success).toBe(false)
})

test('init WorktreeArgsSchema allows slashes in name', () => {
  const result = InitSchema.safeParse({
    name: 'feature/branch',
    backendPort: 8001,
  })
  expect(result.success).toBe(true)
})

test('init WorktreeArgsSchema rejects port below 1024 (privileged)', () => {
  const result = InitSchema.safeParse({ name: 'x', backendPort: 80 })
  expect(result.success).toBe(false)
})

test('init WorktreeArgsSchema rejects port above 65535', () => {
  const result = InitSchema.safeParse({ name: 'x', backendPort: 70000 })
  expect(result.success).toBe(false)
})

test('init WorktreeArgsSchema rejects non-integer port', () => {
  const result = InitSchema.safeParse({ name: 'x', backendPort: 8000.5 })
  expect(result.success).toBe(false)
})

test('init validateArgs returns empty array for valid args', () => {
  const errors = validateInitArgs({ name: 'feat', backendPort: 9000 })
  expect(errors).toEqual([])
})

test('init validateArgs returns ValidationError objects for invalid args', () => {
  const errors = validateInitArgs({ name: '', backendPort: 80 })
  expect(errors.length).toBeGreaterThanOrEqual(1)
  for (const e of errors) {
    expect(typeof e.field).toBe('string')
    expect(typeof e.message).toBe('string')
    expect(e.message.length).toBeGreaterThan(0)
  }
})

test('init validateArgs field path points at the offending field', () => {
  const errors = validateInitArgs({ name: '', backendPort: 8001 })
  expect(errors.some((e) => e.field.includes('name'))).toBe(true)
  expect(errors.some((e) => e.field.includes('backendPort'))).toBe(false)
})

// ---------------------------------------------------------------------------
// cleanup-worktree.ts: WorktreeArgsSchema + validateArgs
// ---------------------------------------------------------------------------

test('cleanup WorktreeArgsSchema accepts valid name', () => {
  const result = CleanupSchema.safeParse({ name: 'feature-branch' })
  expect(result.success).toBe(true)
})

test('cleanup WorktreeArgsSchema rejects empty name', () => {
  const result = CleanupSchema.safeParse({ name: '' })
  expect(result.success).toBe(false)
})

test('cleanup WorktreeArgsSchema rejects name over 50 chars', () => {
  const result = CleanupSchema.safeParse({ name: 'a'.repeat(51) })
  expect(result.success).toBe(false)
})

test('cleanup WorktreeArgsSchema rejects name with disallowed characters', () => {
  const result = CleanupSchema.safeParse({ name: 'bad name!' })
  expect(result.success).toBe(false)
})

test('cleanup validateArgs returns empty array for valid name', () => {
  const errors = validateCleanupArgs({ name: 'feat' })
  expect(errors).toEqual([])
})

test('cleanup validateArgs returns error message strings for invalid name', () => {
  const errors = validateCleanupArgs({ name: '' })
  expect(errors.length).toBeGreaterThanOrEqual(1)
  for (const m of errors) {
    expect(typeof m).toBe('string')
    expect(m.length).toBeGreaterThan(0)
  }
})

// ---------------------------------------------------------------------------
// cleanup-worktree.ts: getWorktreePorts
// ---------------------------------------------------------------------------

test('getWorktreePorts returns empty object when no env files exist', () => {
  const ports = getWorktreePorts(tmpRoot)
  expect(ports).toEqual({})
})

test('getWorktreePorts parses backendPort from .env.development.local', () => {
  writeFileSync(
    join(tmpRoot, '.env.development.local'),
    'NEXT_PUBLIC_CODEBUFF_BACKEND_URL=http://localhost:8001\n',
  )
  const ports = getWorktreePorts(tmpRoot)
  expect(ports.backendPort).toBe(8001)
})

test('getWorktreePorts parses backendPort from .env.development', () => {
  writeFileSync(
    join(tmpRoot, '.env.development'),
    'NEXT_PUBLIC_CODEBUFF_BACKEND_URL=https://api.example.com:3000\n',
  )
  const ports = getWorktreePorts(tmpRoot)
  expect(ports.backendPort).toBe(3000)
})

test('getWorktreePorts prefers .env.development.local over .env.development', () => {
  writeFileSync(
    join(tmpRoot, '.env.development.local'),
    'NEXT_PUBLIC_CODEBUFF_BACKEND_URL=http://localhost:1111\n',
  )
  writeFileSync(
    join(tmpRoot, '.env.development'),
    'NEXT_PUBLIC_CODEBUFF_BACKEND_URL=http://localhost:2222\n',
  )
  const ports = getWorktreePorts(tmpRoot)
  expect(ports.backendPort).toBe(1111)
})

test('getWorktreePorts returns empty object when URL has no explicit port', () => {
  writeFileSync(
    join(tmpRoot, '.env.development'),
    'NEXT_PUBLIC_CODEBUFF_BACKEND_URL=https://api.example.com\n',
  )
  const ports = getWorktreePorts(tmpRoot)
  expect(ports.backendPort).toBeUndefined()
})

test('getWorktreePorts returns empty object when the key is absent', () => {
  writeFileSync(join(tmpRoot, '.env.development'), 'OTHER_KEY=value\n')
  const ports = getWorktreePorts(tmpRoot)
  expect(ports).toEqual({})
})

test('getWorktreePorts continues to next file when earlier file lacks the key', () => {
  writeFileSync(join(tmpRoot, '.env.development.local'), 'UNRELATED=true\n')
  writeFileSync(
    join(tmpRoot, '.env.development'),
    'NEXT_PUBLIC_CODEBUFF_BACKEND_URL=http://localhost:4242\n',
  )
  const ports = getWorktreePorts(tmpRoot)
  expect(ports.backendPort).toBe(4242)
})

test('getWorktreePorts tolerates malformed env file without throwing', () => {
  writeFileSync(
    join(tmpRoot, '.env.development'),
    'this is not valid env content\nNEXT_PUBLIC_CODEBUFF_BACKEND_URL=http://localhost:9999\n',
  )
  const ports = getWorktreePorts(tmpRoot)
  expect(ports.backendPort).toBe(9999)
})

test('WORKTREES_DIR constant points at the shared worktrees directory', () => {
  expect(WORKTREES_DIR).toBe('../codebuff-worktrees')
})
