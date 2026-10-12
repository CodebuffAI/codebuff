/** Creation-time host context; retained in ordinary native conversation history. */
export const APPEND_INSTRUCTIONS_KEY = 'host://append-instructions'
export const MAX_APPEND_INSTRUCTIONS_BYTES = 64 * 1024

export class AppendInstructionsError extends Error {
  constructor(message = 'Invalid append instructions configuration; use a readable UTF-8 regular file of 1–65536 bytes.') {
    super(message)
    this.name = 'AppendInstructionsError'
  }
}

export function validateAppendInstructions(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > MAX_APPEND_INSTRUCTIONS_BYTES ||
      !value.trim() || value.includes('\0') ||
      new TextEncoder().encode(value).length > MAX_APPEND_INSTRUCTIONS_BYTES ||
      // Reject unpaired UTF-16 surrogates rather than silently replacing input.
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
    throw new AppendInstructionsError()
  }
}
