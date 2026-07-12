import { readFileSync } from 'fs'
import path from 'path'

import { describe, expect, test } from 'bun:test'

import {
  agentDefinitionSource,
  toolsSource,
  utilTypesSource,
} from '../data/initial-agent-type-sources.generated'

const repoRoot = path.resolve(__dirname, '../../..')
const typeDir = path.join(
  repoRoot,
  'common',
  'src',
  'templates',
  'initial-agents-dir',
  'types',
)

describe('generated init type sources', () => {
  test.each([
    ['agent-definition.ts', agentDefinitionSource],
    ['tools.ts', toolsSource],
    ['util-types.ts', utilTypesSource],
  ])('%s matches its canonical source file', (fileName, generatedSource) => {
    expect(generatedSource).toBe(
      readFileSync(path.join(typeDir, fileName), 'utf8'),
    )
  })
})
