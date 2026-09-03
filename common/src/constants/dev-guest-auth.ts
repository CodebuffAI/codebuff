/**
 * The local-development guest login's NextAuth provider id.
 *
 * Lives in `common`, not in `packages/auth`, for the same reason as
 * `freebuff-signup-block.ts`: the login page is a client component, and
 * importing anything from the auth barrel drags `db`, `stripe` and
 * `node:net` into the browser bundle — which does not degrade, it breaks the
 * whole page with `Export env doesn't exist in target module`.
 *
 * The provider is only ever mounted on a non-production build that has opted
 * in via `FREEBUFF_DEV_GUEST_LOGIN`; this file is just the shared name, so
 * that the button and the provider cannot disagree about it.
 */
export const DEV_GUEST_PROVIDER = 'dev-guest'
