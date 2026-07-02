"use server";

import {
  getReferralCode,
  clearReferralCode,
  ensureDeviceId,
  setReferralCode,
} from "@/vly/lib/referral-cookies";

export async function getReferralCodeFromCookie() {
  return await getReferralCode();
}

export async function clearReferralCookie() {
  await clearReferralCode();
}

export async function storeReferralCookie(code: string) {
  const trimmed = code.trim();
  // Postgres share codes are `ref-<uuid>`; legacy Convex codes are short
  // uppercase alphanumerics. Accept both, ignore junk. Case is preserved
  // because the Postgres lookup is exact.
  if (!/^[A-Za-z0-9-]{3,64}$/.test(trimmed)) return;
  await setReferralCode(trimmed);
  // Stamp the browser alongside the referral cookie so attribution can record
  // which device the invite was redeemed from (sock-puppet forensics).
  await ensureDeviceId();
}
