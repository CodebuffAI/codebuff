import { expect, test } from 'bun:test'

import {
  CLOUD_ARCHIVE_BYTES,
  CLOUD_ARCHIVE_LIMIT_MESSAGE,
  CLOUD_EXPANDED_BYTES,
  CLOUD_SOURCE_FILES,
  CLOUD_SOURCE_LIMIT_MESSAGE,
} from './archive'

// Both refusals used to state the number and stop there, leaving the user no
// move: the inventory already excludes .git, node_modules, dist, build, .next
// and .cache, so "remove build output" is not the answer, and `.freebuffignore`
// appears nowhere else in the Desktop UI. 36 and 43 app sessions hit these in
// the 7 days to 2026-10-16.
test('a size refusal names the one lever the user has', () => {
  for (const message of [
    CLOUD_ARCHIVE_LIMIT_MESSAGE,
    CLOUD_SOURCE_LIMIT_MESSAGE,
  ]) {
    expect(message).toContain('.freebuffignore')
    expect(message).toMatch(/retry\.$/)
    // Never advice we know is wrong for these users.
    expect(message).not.toMatch(/build output|node_modules/)
  }
})

// Copy that repeats a number drifts from the thing that enforces it, so both
// messages interpolate the budgets rather than spelling them out.
test('the limits in the copy are the limits in force', () => {
  expect(CLOUD_ARCHIVE_LIMIT_MESSAGE).toContain(
    `${CLOUD_ARCHIVE_BYTES / 1024 ** 3} GiB`,
  )
  expect(CLOUD_SOURCE_LIMIT_MESSAGE).toContain(
    `${CLOUD_EXPANDED_BYTES / 1024 ** 3} GiB`,
  )
  expect(CLOUD_SOURCE_LIMIT_MESSAGE).toContain(
    CLOUD_SOURCE_FILES.toLocaleString('en-US'),
  )
  // The wording the two surfaces shipped with, kept verbatim.
  expect(CLOUD_ARCHIVE_LIMIT_MESSAGE).toStartWith(
    'Project archive exceeds the 4 GiB compressed limit.',
  )
  expect(CLOUD_SOURCE_LIMIT_MESSAGE).toStartWith(
    'Cloud projects support up to 16 GiB of source files and 200,000 files.',
  )
})
