// Shared NextAuth configuration factory used by both the Codebuff (`web/`) and
// Freebuff (`freebuff/web/`) apps. Owns the providers (GitHub + Google),
// cross-provider account linking, security gates, and shared signup side
// effects. App-specific bits are injected via hooks. See ./create-auth-options.
export * from './create-auth-options'
