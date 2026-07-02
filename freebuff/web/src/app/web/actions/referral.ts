"use server";

import { recordReferralClick } from "@codebuff/billing";

import {
  getReferralCode,
  clearReferralCode,
  ensureDeviceId,
  setReferralCode,
} from "@/vly/lib/referral-cookies";
import { logger } from "@/util/logger";

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
  const deviceId = await ensureDeviceId();

  // Record a click for the referrer funnel, deduped per (code, device) so
  // reloads/return visits don't re-count. Best-effort: a failure here must
  // never break attribution, and unknown/legacy codes are ignored downstream.
  if (deviceId) {
    try {
      await recordReferralClick({ code: trimmed, deviceId });
    } catch (error) {
      logger.warn(
        { error },
        "Failed to record referral click; attribution still stored",
      );
    }
  }
}
