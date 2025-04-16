import { describe, it, expect, mock } from 'bun:test'
import { createPatch } from 'diff'
import path from 'path'
import {
  preserveCommentsInEditSnippet,
  rewriteWithOpenAI,
} from '../fast-rewrite'
import { TEST_USER_ID } from 'common/constants'

// Mock database interactions
mock.module('pg-pool', () => ({
  Pool: class {
    connect() {
      return {
        query: () => ({
          rows: [{ id: 'test-user-id' }],
          rowCount: 1,
        }),
        release: () => {},
      }
    }
  },
}))

// Mock message saving
mock.module('backend/llm-apis/message-cost-tracker', () => ({
  saveMessage: () => Promise.resolve(),
}))

describe.skip('preserveCommentsInEditSnippet', () => {
  it('should preserve existing comments from original file', async () => {
    const initialContent = `
function test() {
  // This function should return true
  return true;
}
`.trim()

    const editSnippet = `
function test() {
  return true;
}
`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(
      `
function test() {
  // This function should return true
  return true;
}
`.trim()
    )
  })

  it('should not add comments that are not in the original file', async () => {
    const initialContent = `
function test() {
  return true;
}
`.trim()

    const editSnippet = `
// Added this comment
function test() {
  return true;
}
`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(
      `
function test() {
  return true;
}
`.trim()
    )
  })

  it('should return edit snippet unchanged when no comments need to be preserved', async () => {
    const initialContent = `
function test() {
  return true;
}
`.trim()

    const editSnippet = `
function test() {
  return false;
}
`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(editSnippet)
  })

  it('should remove comments about edits but keep other new comments', async () => {
    const initialContent = `
function test() {
  // Important: Always return true
  return true;
}
`.trim()

    const editSnippet = `
// Add new parameter
function test(flag: boolean) {
  // Important: Always return true
  // Change return value based on flag
  return flag;
}
`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(
      `
function test(flag: boolean) {
  // Important: Always return true
  return flag;
}
`.trim()
    )
  })

  it('should handle complex real-world code with various comment styles', async () => {
    const initialContent = `import { createPatch } from 'diff';

function getLineEnding(content: string) {
  return content.includes('\\r\\n') ? '\\r\\n' : '\\n';
}

function patch(filePath: string, oldContent: string, newContent: string) {
  const lineEnding = getLineEnding(oldContent);
  const normalizedOld = oldContent.replace(/\\r\\n/g, '\\n');
  const normalizedNew = newContent.replace(/\\r\\n/g, '\\n');
  return createPatch(filePath, normalizedOld, normalizedNew);
}

/**
 * Processes a file change by applying patches and handling line endings.
 */
export async function processFileChange(filePath: string, oldContent: string, newContent: string): Promise<FileChange | null> {
  // Skip processing if content is identical
  if (oldContent === newContent) {
    return null;
  }

  /* Detect line endings in original file
     This is important for cross-platform compatibility */
  const lineEnding = oldContent.includes('\\r\\n') ? '\\r\\n' : '\\n';

  // Normalize line endings for comparison
  const normalizedOld = oldContent.replace(/\\r\\n/g, '\\n');
  const normalizedNew = newContent.replace(/\\r\\n/g, '\\n');

  try {
    // Generate patch with normalized content
    const patch = createPatch(filePath, normalizedOld, normalizedNew);

    // No changes needed if patch is empty
    if (!patch) return null;

    return {
      path: filePath,
      content: newContent, // Preserve original line endings in content
      patch: patch.replace(/\\n/g, lineEnding) // Restore original line endings in patch
    };
  } catch (error) {
    // Log error and rethrow
    logger.error({ error, filePath }, 'Failed to process file change');
    throw error;
  }
}`.trim()

    const editSnippet = `// ... existing code ...

function patch(filePath: string, oldContent: string, newContent: string) {
  const lineEnding = getLineEnding(oldContent);
  const normalizedOld = oldContent.replace(/\\r\\n/g, '\\n');
  const normalizedNew = newContent.replace(/\\r\\n/g, '\\n');
  return createPatch(filePath, normalizedOld, normalizedNew);
}

export async function processFileChange(
  filePath: string,
  oldContent: string,
  newContent: string,
  isBinary = false
): Promise<FileChange | null> {
  if (isBinary) {
    return handleBinaryFile(filePath, oldContent, newContent);
  }

  if (oldContent === newContent) {
    return null;
  }

  const lineEnding = oldContent.includes('\\r\\n') ? '\\r\\n' : '\\n';

  const normalizedOld = oldContent.replace(/\\r\\n/g, '\\n');
  const normalizedNew = newContent.replace(/\\r\\n/g, '\\n');

  try {
    const patch = createPatch(filePath, normalizedOld, normalizedNew);

    if (!patch) return null;

    return {
      path: filePath,
      content: newContent, // Preserve original line endings in content
      patch: patch.replace(/\\n/g, lineEnding) // Restore original line endings in patch
    };
  } catch (error) {
    logger.error({ error, filePath, isBinary }, 'Failed to process file change');
    throw new Error('Failed to process ' + (isBinary ? 'binary ' : '') + 'file: ' + filePath);
  }
}`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(
      `// ... existing code ...

function patch(filePath: string, oldContent: string, newContent: string) {
  const lineEnding = getLineEnding(oldContent);
  const normalizedOld = oldContent.replace(/\\r\\n/g, '\\n');
  const normalizedNew = newContent.replace(/\\r\\n/g, '\\n');
  return createPatch(filePath, normalizedOld, normalizedNew);
}

/**
 * Processes a file change by applying patches and handling line endings.
 */
export async function processFileChange(
  filePath: string,
  oldContent: string,
  newContent: string,
  isBinary = false
): Promise<FileChange | null> {
  if (isBinary) {
    return handleBinaryFile(filePath, oldContent, newContent);
  }

  // Skip processing if content is identical
  if (oldContent === newContent) {
    return null;
  }

  /* Detect line endings in original file
     This is important for cross-platform compatibility */
  const lineEnding = oldContent.includes('\\r\\n') ? '\\r\\n' : '\\n';

  // Normalize line endings for comparison
  const normalizedOld = oldContent.replace(/\\r\\n/g, '\\n');
  const normalizedNew = newContent.replace(/\\r\\n/g, '\\n');

  try {
    // Generate patch with normalized content
    const patch = createPatch(filePath, normalizedOld, normalizedNew);

    // No changes needed if patch is empty
    if (!patch) return null;

    return {
      path: filePath,
      content: newContent, // Preserve original line endings in content
      patch: patch.replace(/\\n/g, lineEnding) // Restore original line endings in patch
    };
  } catch (error) {
    // Log error and rethrow
    logger.error({ error, filePath, isBinary }, 'Failed to process file change');
    throw new Error('Failed to process ' + (isBinary ? 'binary ' : '') + 'file: ' + filePath);
  }
}`.trim()
    )
  })

  it('should preserve placeholder comments in edit snippet', async () => {
    const initialContent = `
function test() {
// This should return true
return true;
}

function another() {
return false;
}
`.trim()

    const editSnippet = `
// ... existing code ...

function another() {
return true;
}

// ... rest of the file ...
`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(
      `
// ... existing code ...

function another() {
return true;
}

// ... rest of the file ...
`.trim()
    )
  })

  it('should handle placeholder comments in complex code', async () => {
    const initialContent = `
import { createPatch } from 'diff';

function getLineEnding(content: string) {
return content.includes('\\r\\n') ? '\\r\\n' : '\\n';
}

function patch(filePath: string, oldContent: string, newContent: string) {
const lineEnding = getLineEnding(oldContent);
const normalizedOld = oldContent.replace(/\\r\\n/g, '\\n');
const normalizedNew = newContent.replace(/\\r\\n/g, '\\n');
return createPatch(filePath, normalizedOld, normalizedNew);
}

function processFile(path: string) {
return path;
}
`.trim()

    const editSnippet = `
// ... existing code ...

function patch(filePath: string, oldContent: string, newContent: string) {
const lineEnding = getLineEnding(oldContent);
const normalizedOld = oldContent.replace(/\\r\\n/g, '\\n');
const normalizedNew = newContent.replace(/\\r\\n/g, '\\n');
return createPatch(filePath, normalizedOld, normalizedNew);
}

// ... rest of the file ...
`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(
      `
// ... existing code ...

function patch(filePath: string, oldContent: string, newContent: string) {
const lineEnding = getLineEnding(oldContent);
const normalizedOld = oldContent.replace(/\\r\\n/g, '\\n');
const normalizedNew = newContent.replace(/\\r\\n/g, '\\n');
return createPatch(filePath, normalizedOld, normalizedNew);
}

// ... rest of the file ...
`.trim()
    )
  })
})

describe.skip('rewriteWithOpenAI', () => {
  it('should correctly integrate edit snippet changes while preserving formatting', async () => {
    const testDataDir = path.join(__dirname, 'test-data', 'dex-go')
    const originalContent = await Bun.file(`${testDataDir}/original.go`).text()
    const editSnippet = await Bun.file(`${testDataDir}/edit-snippet.go`).text()
    const expectedResult = await Bun.file(`${testDataDir}/expected.go`).text()

    const result = await rewriteWithOpenAI(
      originalContent,
      editSnippet,
      'taskruntoolcall.go',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      undefined
    )

    const patch = createPatch('test.ts', expectedResult, result)
    const patchLines = patch.split('\n').slice(4)
    const linesChanged = patchLines.filter(
      (line) => line.startsWith('+') || line.startsWith('-')
    ).length
    console.log(patch)
    expect(linesChanged).toBeLessThanOrEqual(14)
  }, 240_000)
})
