import type { FreebuffSessionResponse } from '../types/freebuff-session'

export interface FreebuffSessionResult {
  session: FreebuffSessionResponse | null
  error: string | null
}

/** Always returns null - stub for deleted hosted auth. */
export function useFreebuffSession(): FreebuffSessionResult {
  return { session: null, error: null }
}

// Stubs for exported functions — all silently no-op rather than throw
export function getFreebuffInstanceId(): undefined { return undefined }
export function refreshFreebuffSession(_opts?: { resetChat?: boolean }): void {}
export function returnToFreebuffLanding(_opts?: { resetChat?: boolean }): void {}
export function refreshFreebuffLandingMetadata(): void {}
export function joinFreebuffQueue(_model: string): void {}
export function takeOverFreebuffSession(): void {}
export function endFreebuffSessionBestEffort(): void {}
export function markFreebuffSessionSuperseded(): void {}
export function markFreebuffSessionCountryBlocked(_params: unknown): void {}
export function markFreebuffSessionEnded(): void {}