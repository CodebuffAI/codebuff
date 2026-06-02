"use client";

/**
 * Compact Referral/Earn Button Component
 * Always routes users to the dedicated Earn dashboard.
 */

import { Gift, ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface CompactReferralButtonProps {
  primaryCode?: { code: string } | null;
  onCreateCode: () => Promise<{ code: string }>;
}

export function CompactReferralButton({
  primaryCode,
  onCreateCode,
}: CompactReferralButtonProps) {
  const router = useRouter();
  void primaryCode;
  void onCreateCode;

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex items-center gap-1 rounded-md bg-gradient-to-r from-emerald-50 to-teal-50 px-2 py-1">
        <Gift className="h-3 w-3 text-emerald-600" />
        <span className="whitespace-nowrap text-[11px] font-semibold text-emerald-900">
          Earn unlimited credits
        </span>
      </div>
      <button
        onClick={() => router.push("/web/earn")}
        className="group relative flex h-6 w-full items-center justify-center gap-1 overflow-hidden rounded-md border border-emerald-300 bg-gradient-to-r from-emerald-600 to-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm outline outline-1 outline-emerald-400/40 transition-all duration-200 hover:shadow-md hover:outline-emerald-400/60 active:scale-95"
      >
        <ArrowUpRight className="h-3 w-3" />
        <span>Open Earn</span>
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
      </button>
    </div>
  );
}
