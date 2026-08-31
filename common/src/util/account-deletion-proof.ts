const PROOF_VERSION = 'v1'

const encoder = new TextEncoder()

function proofPayload(identitySubject: string, code: string): ArrayBuffer {
  const subject = identitySubject.trim()
  const normalizedCode = code.trim()
  const encoded = encoder.encode(
    `${PROOF_VERSION}:${subject.length}:${subject}:${normalizedCode.length}:${normalizedCode}`,
  )
  // `Uint8Array#buffer` is `ArrayBufferLike` in this repo's older TS lib and
  // therefore also admits SharedArrayBuffer, which Web Crypto rejects here.
  const payload = new ArrayBuffer(encoded.byteLength)
  new Uint8Array(payload).set(encoded)
  return payload
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function signature(
  secret: string,
  identitySubject: string,
  code: string,
): Promise<string> {
  if (secret.length < 32) {
    throw new Error(
      'account deletion proof secret must be at least 32 characters',
    )
  }
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(
    await crypto.subtle.sign('HMAC', key, proofPayload(identitySubject, code)),
  )
}

/**
 * Server proof that Adbuff deletion completed before a Convex account purge.
 *
 * The proof is deliberately bound to both the authenticated subject and the
 * mailed deletion code. It is never returned to the browser: the Next route
 * mints it only after Adbuff reports an active suppression fence and presents
 * it on each bounded Convex purge pass.
 */
export async function createAccountDeletionProof(
  secret: string,
  identitySubject: string,
  code: string,
): Promise<string> {
  return `${PROOF_VERSION}.${await signature(secret, identitySubject, code)}`
}

/** Constant-time comparison over fixed-size HMAC hex strings. */
export async function verifyAccountDeletionProof(
  proof: string,
  secret: string,
  identitySubject: string,
  code: string,
): Promise<boolean> {
  const expected = await createAccountDeletionProof(
    secret,
    identitySubject,
    code,
  )
  if (proof.length !== expected.length) return false

  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |= proof.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}
