// A literal, not upstream's `__PACKAGE_VERSION__` global: a bundler `define`
// replaces only unbound identifiers, so no build can change the SDK version
// every client sends. The server refuses any other one (web/src/llm-api/sdk-build.ts).
export const VERSION: string = '0.0.0-test'
