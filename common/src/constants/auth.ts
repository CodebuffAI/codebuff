/**
 * How long a device-code sign-in stays valid.
 *
 * Shared because two apps issue these codes — codebuff.com serves the CLI and freebuff.com serves
 * Freebuff Desktop — and a drift between them would show up only as one surface timing out sooner
 * than the other, with nothing to point at.
 *
 * The `/api/auth/cli/code` response sends this as `expiresInMs` **alongside** the absolute
 * `expiresAt`, and they are not redundant:
 *
 * - `expiresAt` is an instant on the SERVER's clock. It has to stay: it is the HMAC input the
 *   status endpoint verifies, so clients must echo it back byte-for-byte.
 * - `expiresInMs` is a duration, which means nothing about it depends on the client's clock. A
 *   client that subtracts `expiresAt` from its own `Date.now()` is silently asking every user's
 *   system clock to be right — and a machine running an hour fast rejects every code it is ever
 *   issued, permanently, with a 200 in our logs. That was a real, unfixable-by-reinstalling bug.
 */
export const CLI_AUTH_CODE_LIFETIME_MS = 60 * 60 * 1000
