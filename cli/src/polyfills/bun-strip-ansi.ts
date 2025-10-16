import { stripAnsi } from '@codebuff/common/util/string'

// Bun 1.2 removed Bun.stripANSI; provide a fallback for libraries that still call it.
const bunGlobal = globalThis as typeof globalThis & {
  Bun?: {
    stripANSI?: (input: string) => string
  }
}

if (bunGlobal.Bun && typeof bunGlobal.Bun.stripANSI !== 'function') {
  bunGlobal.Bun.stripANSI = stripAnsi
}
