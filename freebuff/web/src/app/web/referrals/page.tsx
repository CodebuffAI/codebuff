"use client";

import Footer from "@/vly/components/landing-4/Footer";
import Navigation from "@/vly/components/landing-4/Navigation";
import { Badge } from "@/vly/components/ui/badge";
import { Button } from "@/vly/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/vly/components/ui/card";
import { Skeleton } from "@/vly/components/ui/skeleton";
import { useSignedInUser } from "@/vly/hooks/use-user";
import { cn } from "@/lib/utils";
import {
  Check,
  CheckCircle,
  Copy,
  Gift,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { FreebuffReferralTier } from "@codebuff/common/constants/freebuff-referral-tiers";

interface ReferralStatus {
  /** Share code — the user's Postgres referral_code, shared with the CLI program. */
  code: string | null;
  qualifiedReferralCount: number;
  currentTier: FreebuffReferralTier;
  nextTier: FreebuffReferralTier | null;
  tiers: FreebuffReferralTier[];
  minGithubAccountAgeMonths: number;
  recentReferrals: { status: "pending" | "completed"; createdAt: number }[];
}

export default function ReferralsPage() {
  const user = useSignedInUser();
  const [status, setStatus] = useState<ReferralStatus | null>(null);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/web/referrals")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load referral status");
        return (await res.json()) as ReferralStatus;
      })
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load your referral status");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shareUrl = status?.code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${status.code}`
    : null;

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-2xl font-semibold">Please sign in</h2>
          <p className="text-muted-foreground">
            You need to be signed in to view your referrals
          </p>
        </div>
      </div>
    );
  }

  const currentTier = status?.currentTier;
  const nextTier = status?.nextTier;
  const qualifiedCount = status?.qualifiedReferralCount ?? 0;
  const progressToNext = nextTier
    ? Math.min(1, qualifiedCount / nextTier.referralsRequired)
    : 1;

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="mb-2 text-4xl font-bold">Refer friends</h1>
            <p className="text-muted-foreground">
              Share Freebuff and unlock higher daily limits and perks. A
              referral counts when your friend signs up with a GitHub account
              that's at least {status?.minGithubAccountAgeMonths ?? 4} months
              old.
            </p>
          </div>

          {/* Share link */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5" />
                Your referral link
              </CardTitle>
              <CardDescription>
                Anyone who signs up through this link counts toward your tier
              </CardDescription>
            </CardHeader>
            <CardContent>
              {shareUrl ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="flex-1 truncate rounded bg-muted p-3 text-sm">
                    {shareUrl}
                  </code>
                  <Button onClick={handleCopy} className="shrink-0">
                    {copied ? (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy link
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <Skeleton className="h-12 w-full" />
              )}
            </CardContent>
          </Card>

          {/* Progress */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Qualified referrals
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {!status ? <Skeleton className="h-9 w-16" /> : qualifiedCount}
                </div>
                {currentTier && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tier {currentTier.tier} unlocked
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {nextTier ? `Next: Tier ${nextTier.tier}` : "Max tier"}
                </CardTitle>
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {!status ? (
                  <Skeleton className="h-9 w-full" />
                ) : nextTier ? (
                  <>
                    <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progressToNext * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {nextTier.referralsRequired - qualifiedCount} more{" "}
                      {nextTier.referralsRequired - qualifiedCount === 1
                        ? "referral"
                        : "referrals"}{" "}
                      to unlock {nextTier.standardModelDailyLimit} standard +{" "}
                      {nextTier.premiumModelDailyLimit} premium messages / day
                      {nextTier.removesWatermark &&
                      !currentTier?.removesWatermark
                        ? " and watermark removal"
                        : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    You've unlocked everything. Thanks for sharing Freebuff!
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tier table */}
          <Card>
            <CardHeader>
              <CardTitle>Tiers & perks</CardTitle>
              <CardDescription>
                Daily limits and perks unlocked at each tier
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!status ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {status.tiers.map((tier, index) => {
                    const unlocked = qualifiedCount >= tier.referralsRequired;
                    const isCurrent = currentTier?.tier === tier.tier;
                    // Show the step from the previous tier ("+2") alongside
                    // the total ("3 total") so the ladder reads at a glance.
                    const stepFromPrev =
                      index > 0
                        ? tier.referralsRequired -
                          status.tiers[index - 1].referralsRequired
                        : tier.referralsRequired;
                    return (
                      <div
                        key={tier.tier}
                        className={cn(
                          "flex items-center justify-between rounded-lg border p-4",
                          isCurrent && "border-primary bg-primary/5",
                          !unlocked && "opacity-70",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                              unlocked
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {unlocked ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              tier.referralsRequired
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                Tier {tier.tier}
                              </span>
                              {isCurrent && (
                                <Badge variant="default">Current</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {tier.referralsRequired === 0
                                  ? "Everyone"
                                  : index === 1
                                    ? `${tier.referralsRequired} ${
                                        tier.referralsRequired === 1
                                          ? "referral"
                                          : "referrals"
                                      }`
                                    : `+${stepFromPrev} (${tier.referralsRequired} total)`}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {tier.standardModelDailyLimit} standard +{" "}
                              {tier.premiumModelDailyLimit} premium messages
                              per day
                              {tier.removesWatermark
                                ? " · watermark removed from deploys"
                                : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent referrals */}
          {status && status.recentReferrals.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Recent signups</CardTitle>
                <CardDescription>
                  People who signed up through your link
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {status.recentReferrals.map((referral, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded border p-3 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {new Date(referral.createdAt).toLocaleDateString()}
                      </span>
                      <Badge
                        variant={
                          referral.status === "completed"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {referral.status === "completed"
                          ? "Qualified"
                          : "Pending"}
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Signups stay pending until the GitHub account is at least{" "}
                  {status.minGithubAccountAgeMonths} months old and hasn't
                  already earned a referral bonus before.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
