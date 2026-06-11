// Shared implementation lives in @codebuff/internal so the Freebuff Web app
// (freebuff/web) reuses the exact same country + VPN/proxy decision logic and
// in-memory provider caches. This module is a re-export to keep existing
// imports (and their behavior) unchanged.
export * from '@codebuff/internal/free-mode-country/country-access'
export * from '@codebuff/internal/free-mode-country/client-hints'
