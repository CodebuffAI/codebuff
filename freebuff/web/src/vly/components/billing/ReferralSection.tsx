"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { Badge } from "@/vly/components/ui/badge";
import {
  Gift,
  Copy,
  CheckCircle,
  ExternalLink,
  TrendingUp,
  Coins,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export function ReferralSection() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Get user's referral data
  const userCodes = useQuery(api.referrals.getUserReferralCodes);
  const rewardsSummary = useQuery(
    api.referralRewards.getReferralRewardsSummary,
  );
  const createCode = useMutation(api.referrals.createReferralCode);

  // Get the primary referral code or create one
  const primaryCode = userCodes?.[0];

  const handleCreateCode = async () => {
    setIsCreating(true);
    try {
      const result = await createCode({});
      toast.success(`Created referral code: ${result.code}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to create referral code");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatCredits = (credits: number) => {
    if (credits >= 1000000) {
      return `${(credits / 1000000).toFixed(1)}M`.replace(".0M", "M");
    }
    // For values < 1M, show as decimal of millions (e.g., "0.063M" for 63K)
    if (credits >= 1000) {
      return `${(credits / 1000000).toFixed(3)}M`.replace(/\.?0+$/, "");
    }
    return credits.toString();
  };

  return (
    <div className="rounded-[20px] border border-white bg-white/40 outline outline-1 outline-white backdrop-blur-[80px] transition-all duration-200">
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Gift className="h-4 w-4 text-green-600" />
              <h3 className="font-['PP_Cirka'] text-lg font-normal text-zinc-800">
                Invite Friends
              </h3>
            </div>
            <p className="text-xs text-zinc-600">
              Earn spins for each friend who signs up
            </p>
          </div>
          <Link href="/web/earn">
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <ExternalLink className="mr-1 h-3 w-3" />
              Earn Hub
            </Button>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-[12px] border border-white/50 bg-white/20 p-3 text-center backdrop-blur-sm">
            <div className="mb-1 text-lg font-bold text-green-600">
              {rewardsSummary?.successfulReferrals || 0}
            </div>
            <div className="text-xs text-zinc-600">Referrals</div>
          </div>
          <div className="rounded-[12px] border border-white/50 bg-white/20 p-3 text-center backdrop-blur-sm">
            <div className="mb-1 flex items-center justify-center gap-1 text-lg font-bold text-purple-600">
              <Coins className="h-4 w-4" />
              {formatCredits(rewardsSummary?.totalCreditsEarned || 0)}
            </div>
            <div className="text-xs text-zinc-600">Earned</div>
          </div>
          <div className="rounded-[12px] border border-white/50 bg-white/20 p-3 text-center backdrop-blur-sm">
            <div className="mb-1 text-lg font-bold text-orange-600">
              {rewardsSummary?.pendingRewards || 0}
            </div>
            <div className="text-xs text-zinc-600">Pending</div>
          </div>
        </div>

        {/* Referral Link Section */}
        {primaryCode ? (
          <div className="space-y-3">
            <div>
              <label className="mb-2 block text-xs font-medium text-zinc-700">
                Your Referral Link
              </label>
              <div className="flex items-center gap-2">
                <Input
                  value={`${window.location.origin}/?ref=${primaryCode.code}`}
                  readOnly
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyLink(primaryCode.code)}
                  className="h-8 px-3"
                >
                  {copiedCode === primaryCode.code ? (
                    <>
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-600">
              <span>
                Code: <code className="font-mono">{primaryCode.code}</code>
              </span>
              <Badge
                variant={primaryCode.active ? "default" : "secondary"}
                className="text-xs"
              >
                {primaryCode.active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="mb-3 text-sm text-zinc-600">
              Create your referral code to start earning rewards
            </p>
            <Button
              onClick={handleCreateCode}
              disabled={isCreating}
              size="sm"
              className="w-full"
            >
              {isCreating ? "Creating..." : "Create Referral Code"}
            </Button>
          </div>
        )}

        {/* Bottom CTA */}
        {primaryCode && (
          <div className="mt-4 rounded-[12px] border border-green-200/50 bg-green-50/30 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <div className="flex-1">
                <p className="text-xs font-medium text-green-800">
                  Share your link to unlock referral spins.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
