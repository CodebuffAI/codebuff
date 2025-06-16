// Platform-specific PTY module using bun-pty
// bun-pty is self-contained and uses Bun's FFI system

export { spawn } from 'bun-pty'
export type { IPty, IPtyForkOptions, IExitEvent, IDisposable } from 'bun-pty'
