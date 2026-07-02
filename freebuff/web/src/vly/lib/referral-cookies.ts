import { cookies } from "next/headers";

const REFERRAL_COOKIE_NAME = "vly_referral_code";
// Configurable timeout - change this value to adjust the attribution window
export const REFERRAL_ATTRIBUTION_WINDOW_HOURS = 7 * 24;
const COOKIE_MAX_AGE = REFERRAL_ATTRIBUTION_WINDOW_HOURS * 60 * 60; // Convert hours to seconds

export async function setReferralCode(code: string) {
  const cookieStore = await cookies();
  cookieStore.set(REFERRAL_COOKIE_NAME, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function getReferralCode(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(REFERRAL_COOKIE_NAME);
  return cookie?.value;
}

export async function clearReferralCode() {
  const cookieStore = await cookies();
  cookieStore.delete(REFERRAL_COOKIE_NAME);
}

const DEVICE_COOKIE_NAME = "vly_device_id";
// 400 days — the Chrome cap on cookie lifetime. Refreshed on every ensure, so
// an active browser keeps the same id indefinitely.
const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

// Our minted ids are UUIDs, but the cookie is client-controlled: accept only
// UUID-shaped values so a tampered cookie can't smuggle an oversized/garbage
// string into the referral_v2 / user_device indexes.
const DEVICE_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

/**
 * A stable, opaque per-browser id used ONLY for referral sock-puppet
 * detection: attribution records the redeeming browser's id, and authed hops
 * record which browsers each signed-in user has used (`user_device`), so a
 * "friend" who signs up from the referrer's own browser is detectable. Not
 * used for tracking/analytics (PostHog has its own device id) and never
 * gates anything by itself.
 *
 * Returns the existing id when valid (no Set-Cookie churn on the frequent
 * authed hops), otherwise mints one — unless the cookie store is read-only
 * (a Server Component render, e.g. /onboard), where minting is skipped.
 */
export async function ensureDeviceId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
  if (existing && DEVICE_ID_RE.test(existing)) return existing;
  const deviceId = crypto.randomUUID();
  try {
    cookieStore.set(DEVICE_COOKIE_NAME, deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: DEVICE_COOKIE_MAX_AGE,
      path: "/",
    });
  } catch {
    // Read-only cookie store: can't mint a new id this hop.
    return undefined;
  }
  return deviceId;
}

// Client-side cookie utilities
export const clientCookies = {
  set(
    name: string,
    value: string,
    hours: number = REFERRAL_ATTRIBUTION_WINDOW_HOURS,
  ) {
    const expires = new Date();
    expires.setTime(expires.getTime() + hours * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax${
      window.location.protocol === "https:" ? ";Secure" : ""
    }`;
  },

  get(name: string): string | null {
    const nameEQ = name + "=";
    const ca = document.cookie.split(";");
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === " ") c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  },

  delete(name: string) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  },
};
