// TypeScript declaration for contentlayer module
// This prevents type errors when .contentlayer/generated doesn't exist during typecheck

declare module '.contentlayer/generated' {
  export const allDocs: any[]
}
