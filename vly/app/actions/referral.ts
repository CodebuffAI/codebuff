"use server";

import { getReferralCode, clearReferralCode } from "@/lib/referral-cookies";

export async function getReferralCodeFromCookie() {
  return await getReferralCode();
}

export async function clearReferralCookie() {
  await clearReferralCode();
}
