import { exportJWK, generateKeyPair, importPKCS8, SignJWT } from 'jose'

import type { KeyLike, JWK } from 'jose'

export const VLY_CONVEX_AUDIENCE = 'vly-convex'
export const VLY_CONVEX_ISSUER =
  process.env.VLY_CONVEX_AUTH_ISSUER ?? 'https://freebuff.com'

const VLY_CONVEX_JWT_TTL_SECONDS = 10 * 60
const VLY_CONVEX_JWT_ALGORITHM = 'RS256'
const VLY_CONVEX_JWT_KEY_ID =
  process.env.VLY_CONVEX_JWT_KEY_ID ??
  process.env.VLY_CONVEX_JWT_KID ??
  'freebuff-vly-convex'

let keyPairPromise:
  | Promise<{
      privateKey: KeyLike
      publicJwk: JWK
    }>
  | undefined

function normalizePrivateKey(value: string) {
  const trimmed = value.trim()
  if (trimmed.includes('BEGIN')) {
    return trimmed.replace(/\\n/g, '\n')
  }

  return Buffer.from(trimmed, 'base64').toString('utf8')
}

async function loadKeyPair() {
  const configuredPrivateKey = process.env.VLY_CONVEX_JWT_PRIVATE_KEY

  if (configuredPrivateKey) {
    const privateKey = await importPKCS8(
      normalizePrivateKey(configuredPrivateKey),
      VLY_CONVEX_JWT_ALGORITHM,
    )
    const publicJwk = await exportJWK(privateKey)
    delete publicJwk.d
    return {
      privateKey,
      publicJwk: {
        ...publicJwk,
        kid: VLY_CONVEX_JWT_KEY_ID,
        alg: VLY_CONVEX_JWT_ALGORITHM,
        use: 'sig',
      },
    }
  }

  const { privateKey, publicKey } = await generateKeyPair(
    VLY_CONVEX_JWT_ALGORITHM,
    {
      extractable: true,
    },
  )
  return {
    privateKey,
    publicJwk: {
      ...(await exportJWK(publicKey)),
      kid: VLY_CONVEX_JWT_KEY_ID,
      alg: VLY_CONVEX_JWT_ALGORITHM,
      use: 'sig',
    },
  }
}

async function getKeyPair() {
  keyPairPromise ??= loadKeyPair()
  return keyPairPromise
}

export async function getVlyConvexJwks() {
  const { publicJwk } = await getKeyPair()
  return { keys: [publicJwk] }
}

export async function signVlyConvexToken(params: {
  userId: string
  email: string
  name?: string | null
  image?: string | null
}) {
  const { privateKey } = await getKeyPair()
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({
    email: params.email.trim().toLowerCase(),
    name: params.name ?? undefined,
    picture: params.image ?? undefined,
  })
    .setProtectedHeader({
      alg: VLY_CONVEX_JWT_ALGORITHM,
      kid: VLY_CONVEX_JWT_KEY_ID,
    })
    .setSubject(params.userId)
    .setIssuer(VLY_CONVEX_ISSUER)
    .setAudience(VLY_CONVEX_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + VLY_CONVEX_JWT_TTL_SECONDS)
    .sign(privateKey)
}
