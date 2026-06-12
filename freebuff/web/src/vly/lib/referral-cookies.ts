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
