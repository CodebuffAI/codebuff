import './types'
export * from './parse'

// Export common types and utilities
export type { LanguageConfig, RuntimeLanguageLoader } from './languages-common'
export { languageTable, WASM_FILES, setWasmDir } from './languages-common'

export * as bunLanguages from './languages-bun'
export * as nodeLanguages from './languages-node'