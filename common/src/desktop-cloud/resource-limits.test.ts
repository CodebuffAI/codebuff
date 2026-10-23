import { expect, test } from 'bun:test'
import {
  CLOUD_RESOURCE_MESSAGE,
  CLOUD_RESOURCE_PENDING,
  cloudResourceExplanation,
  isCloudResourceMessage,
  type CloudResourceKind,
} from './resource-limits'

test('the explanation names the limit, says whether the files are safe, and what to clean up', () => {
  expect(cloudResourceExplanation('disk', true)).toBe(
    "Cloud stopped this turn because the project's disk is almost full (under 2 GB free). Your files are saved. Build output and large folders such as node_modules usually take the space; remove what you no longer need before running this project in Cloud again.",
  )
  expect(cloudResourceExplanation('memory', false)).toContain(
    'used up its memory. Your files are being saved for recovery; this can take a few minutes. A dev server',
  )
  for (const kind of [
    'disk',
    'memory',
    'cpu',
    'processes',
    'files',
    'time',
  ] as CloudResourceKind[]) {
    const text = cloudResourceExplanation(kind, true)
    expect(text.startsWith('Cloud stopped this turn because')).toBe(true)
    expect(text).toContain('Your files are saved.')
    // The note explains; the fixed error line stays the sentence Desktop compares against.
    expect(isCloudResourceMessage(text)).toBe(false)
  }
  expect(isCloudResourceMessage(CLOUD_RESOURCE_MESSAGE)).toBe(true)
  expect(isCloudResourceMessage(CLOUD_RESOURCE_PENDING)).toBe(true)
})
