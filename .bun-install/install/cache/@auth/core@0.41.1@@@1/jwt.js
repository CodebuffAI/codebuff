/**
 *
 *
 * This module contains functions and types
 * to encode and decode {@link https://authjs.dev/concepts/session-strategies#jwt-session JWT}s
 * issued and used by Auth.js.
 *
 * The JWT issued by Auth.js is _encrypted by default_, using the _A256CBC-HS512_ algorithm ({@link https://www.rfc-editor.org/rfc/rfc7518.html#section-5.2.5 JWE}).
 * It uses the `AUTH_SECRET` environment variable or the passed `secret` property to derive a suitable encryption key.
 *
 * :::info Note
 * Auth.js JWTs are meant to be used by the same app that issued them.
 * If you need JWT authentication for your third-party API, you should rely on your Identity Provider instead.
 * :::
 *
 * ## Installation
 *
 * ```bash npm2yarn
 * npm install @auth/core
 * ```
 *
 * You can then import this submodule from `@auth/core/jwt`.
 *
 * ## Usage
 *
 * :::warning Warning
 * This module *will* be refactored/changed. We do not recommend relying on it right now.
 * :::
 *
 *
 * ## Resources
 *
 * - [What is a JWT session strategy](https://authjs.dev/concepts/session-strategies#jwt-session)
 * - [RFC7519 - JSON Web Token (JWT)](https://www.rfc-editor.org/rfc/rfc7519)
 *
 * @module jwt
 */
import { hkdf } from "@panva/hkdf";
import { EncryptJWT, base64url, calculateJwkThumbprint, jwtDecrypt } from "jose";
import { defaultCookies, SessionStore } from "./lib/utils/cookie.js";
import { MissingSecret } from "./errors.js";
import * as cookie from "./lib/vendored/cookie.js";
const { parse: parseCookie } = cookie;
const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const now = () => (Date.now() / 1000) | 0;
const alg = "dir";
const enc = "A256CBC-HS512";
/** Issues a JWT. By default, the JWT is encrypted using "A256CBC-HS512". */
export async function encode(params) {
    const { token = {}, secret, maxAge = DEFAULT_MAX_AGE, salt } = params;
    const secrets = Array.isArray(secret) ? secret : [secret];
    const encryptionSecret = await getDerivedEncryptionKey(enc, secrets[0], salt);
    const thumbprint = await calculateJwkThumbprint({ kty: "oct", k: base64url.encode(encryptionSecret) }, `sha${encryptionSecret.byteLength << 3}`);
    // @ts-expect-error `jose` allows any object as payload.
    return await new EncryptJWT(token)
        .setProtectedHeader({ alg, enc, kid: thumbprint })
        .setIssuedAt()
        .setExpirationTime(now() + maxAge)
        .setJti(crypto.randomUUID())
        .encrypt(encryptionSecret);
}
/** Decodes an Auth.js issued JWT. */
export async function decode(params) {
    const { token, secret, salt } = params;
    const secrets = Array.isArray(secret) ? secret : [secret];
    if (!token)
        return null;
    const { payload } = await jwtDecrypt(token, async ({ kid, enc }) => {
        for (const secret of secrets) {
            const encryptionSecret = await getDerivedEncryptionKey(enc, secret, salt);
            if (kid === undefined)
                return encryptionSecret;
            const thumbprint = await calculateJwkThumbprint({ kty: "oct", k: base64url.encode(encryptionSecret) }, `sha${encryptionSecret.byteLength << 3}`);
            if (kid === thumbprint)
                return encryptionSecret;
        }
        throw new Error("no matching decryption secret");
    }, {
        clockTolerance: 15,
        keyManagementAlgorithms: [alg],
        contentEncryptionAlgorithms: [enc, "A256GCM"],
    });
    return payload;
}
export async function getToken(params) {
    const { secureCookie, cookieName = defaultCookies(secureCookie ?? false).sessionToken.name, decode: _decode = decode, salt = cookieName, secret, logger = console, raw, req, } = params;
    if (!req)
        throw new Error("Must pass `req` to JWT getToken()");
    const headers = req.headers instanceof Headers ? req.headers : new Headers(req.headers);
    const sessionStore = new SessionStore({ name: cookieName, options: { secure: secureCookie } }, parseCookie(headers.get("cookie") ?? ""), logger);
    let token = sessionStore.value;
    const authorizationHeader = headers.get("authorization");
    if (!token && authorizationHeader?.split(" ")[0] === "Bearer") {
        const urlEncodedToken = authorizationHeader.split(" ")[1];
        token = decodeURIComponent(urlEncodedToken);
    }
    if (!token)
        return null;
    if (raw)
        return token;
    if (!secret)
        throw new MissingSecret("Must pass `secret` if not set to JWT getToken()");
    try {
        return await _decode({ token, secret, salt });
    }
    catch {
        return null;
    }
}
async function getDerivedEncryptionKey(enc, keyMaterial, salt) {
    let length;
    switch (enc) {
        case "A256CBC-HS512":
            length = 64;
            break;
        case "A256GCM":
            length = 32;
            break;
        default:
            throw new Error("Unsupported JWT Content Encryption Algorithm");
    }
    return await hkdf("sha256", keyMaterial, salt, `Auth.js Generated Encryption Key (${salt})`, length);
}
