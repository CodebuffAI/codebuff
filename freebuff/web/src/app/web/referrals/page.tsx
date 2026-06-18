"use client";

import type { FreebuffReferralTier } from "@codebuff/common/constants/freebuff-referral-tiers";

import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CheckCircle,
  Copy,
  Gift,
  Medal,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { AppShell } from "@/vly/components/app-shell/AppShell";
import { AmbientBackdrop } from "@/vly/components/app-shell/AmbientBackdrop";
// NB: `@/components/*` is aliased to `src/vly/components/*`, so the landing
// footer is imported relatively.
import { CtaFooter } from "../../../components/landing/sections/CtaFooter";
import { Avatar, AvatarFallback, AvatarImage } from "@/vly/components/ui/avatar";
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

interface ReferralLeaderboardEntry {
  userId: string;
  name: string;
  profileImage?: string;
  referrals: number;
  rank: number;
  communityUserId?: string;
  isPaidUser: boolean;
  communityBadgeTier: number;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  totalLikesReceived: number;
}

interface ReferralStatus {
  /** Share code - the user's Postgres referral_code, shared with the CLI program. */
  code: string | null;
  qualifiedReferralCount: number;
  currentTier: FreebuffReferralTier;
  nextTier: FreebuffReferralTier | null;
  tiers: FreebuffReferralTier[];
  minGithubAccountAgeMonths: number;
  recentReferrals: { status: "pending" | "completed"; createdAt: number }[];
  leaderboard: ReferralLeaderboardEntry[];
}

const numberFormatter = new Intl.NumberFormat("en-US");

export default function ReferralsPage() {
  const user = useSignedInUser();
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;

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
  }, [user]);

  const shareUrl = status?.code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/web/?ref=${status.code}`
    : null;

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Referral link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) {
    return (
      <AppShell title="Referrals" ambient={<AmbientBackdrop />}>
        <div className="flex min-h-full items-center justify-center px-4 py-20">
          <Card className="w-full max-w-md border-border/60 bg-card/70 text-center shadow-2xl shadow-black/20">
            <CardHeader>
              <CardTitle>Please sign in</CardTitle>
              <CardDescription>
                Sign in to get your referral link and see your progress.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppShell>
    );
  }

  const currentTier = status?.currentTier;
  const nextTier = status?.nextTier;
  const qualifiedCount = status?.qualifiedReferralCount ?? 0;
  const progressToNext = nextTier
    ? Math.min(1, qualifiedCount / nextTier.referralsRequired)
    : 1;
  const referralsNeeded = nextTier
    ? Math.max(0, nextTier.referralsRequired - qualifiedCount)
    : 0;

  return (
    <AppShell
      title="Referrals"
      ambient={<AmbientBackdrop />}
      footer={<CtaFooter />}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <section className="grid gap-6 py-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <Badge className="mb-4 border-primary/25 bg-primary/15 text-primary hover:bg-primary/15">
              <Gift className="mr-1.5 h-3.5 w-3.5" />
              Freebuff referrals
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Share Freebuff. Unlock more daily usage.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              A referral qualifies when your friend signs up with a GitHub
              account that's at least {status?.minGithubAccountAgeMonths ?? 4}{" "}
              months old. Qualified referrals unlock higher message limits and
              Freebuff Web perks.
            </p>
          </div>

          <Card className="border-border/60 bg-background/70 shadow-xl shadow-black/10 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your link</CardTitle>
              <CardDescription>
                Share this URL anywhere you invite builders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {shareUrl ? (
                <div className="space-y-3">
                  <code className="block truncate rounded-xl border border-border/60 bg-muted/45 px-3 py-3 text-xs text-foreground sm:text-sm">
                    {shareUrl}
                  </code>
                  <Button onClick={handleCopy} className="w-full">
                    {copied ? (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy referral link
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Skeleton className="h-11 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            icon={<Users className="h-4 w-4" />}
            label="Qualified referrals"
            value={status ? numberFormatter.format(qualifiedCount) : null}
            detail={currentTier ? `Tier ${currentTier.tier} unlocked` : "Loading tier"}
          />
          <MetricCard
            icon={<Sparkles className="h-4 w-4" />}
            label={nextTier ? `Next: Tier ${nextTier.tier}` : "Max tier"}
            value={nextTier ? `${referralsNeeded} more` : "Complete"}
            detail={
              nextTier
                ? `${nextTier.standardModelDailyLimit} standard + ${nextTier.premiumModelDailyLimit} premium / day`
                : "You've unlocked every referral perk"
            }
          />
          <MetricCard
            icon={<Trophy className="h-4 w-4" />}
            label="Leaderboard"
            value={
              status
                ? status.leaderboard.length > 0
                  ? `${status.leaderboard.length} ranked`
                  : "No leaders yet"
                : null
            }
            detail="Ranked by qualified web referrals"
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <Card className="border-border/60 bg-card/70 shadow-xl shadow-black/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Referral leaderboard
              </CardTitle>
              <CardDescription>
                Top referrers with community followers, projects, and likes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReferralLeaderboard entries={status?.leaderboard} />
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 shadow-xl shadow-black/10">
            <CardHeader>
              <CardTitle>Tiers & perks</CardTitle>
              <CardDescription>
                Progress is based on qualified Freebuff Web referrals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!status ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progressToNext * 100}%` }}
                    />
                  </div>
                  {status.tiers.map((tier, index) => {
                    const unlocked = qualifiedCount >= tier.referralsRequired;
                    const isCurrent = currentTier?.tier === tier.tier;
                    const stepFromPrev =
                      index > 0
                        ? tier.referralsRequired -
                          status.tiers[index - 1].referralsRequired
                        : tier.referralsRequired;

                    return (
                      <div
                        key={tier.tier}
                        className={cn(
                          "rounded-2xl border border-border/60 bg-background/45 p-4 transition-colors",
                          isCurrent && "border-primary/45 bg-primary/10",
                          !unlocked && "opacity-65",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                              unlocked
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {unlocked ? <Check className="h-4 w-4" /> : tier.tier}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">
                                Tier {tier.tier}
                              </span>
                              {isCurrent && <Badge>Current</Badge>}
                              <span className="text-xs text-muted-foreground">
                                {tier.referralsRequired === 0
                                  ? "Everyone"
                                  : index === 1
                                    ? `${tier.referralsRequired} referral`
                                    : `+${stepFromPrev} (${tier.referralsRequired} total)`}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {tier.standardModelDailyLimit} standard +{" "}
                              {tier.premiumModelDailyLimit} premium messages/day
                              {tier.removesWatermark
                                ? " · watermark removed"
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
        </div>

        <Card className="border-border/60 bg-card/70 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle>Recent signups</CardTitle>
            <CardDescription>
              Signups through your link stay pending until the GitHub account
              passes the age and one-time bonus checks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!status ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : status.recentReferrals.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {status.recentReferrals.map((referral, index) => (
                  <div
                    key={`${referral.createdAt}-${index}`}
                    className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 p-4 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {new Date(referral.createdAt).toLocaleDateString()}
                    </span>
                    <Badge
                      variant={
                        referral.status === "completed" ? "default" : "secondary"
                      }
                    >
                      {referral.status === "completed" ? "Qualified" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                No signups yet. Share your link to start climbing the
                leaderboard.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  detail: string;
}) {
  return (
    <Card className="border-border/60 bg-card/70 shadow-xl shadow-black/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div className="text-primary">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">
          {value ?? <Skeleton className="h-9 w-24 rounded-lg" />}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ReferralLeaderboard({
  entries,
}: {
  entries?: ReferralLeaderboardEntry[];
}) {
  if (!entries) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
        No qualified referrals yet. Be the first to rank.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const content = (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/65 font-mono text-sm font-semibold text-muted-foreground">
              {entry.rank <= 3 ? (
                <Medal className="h-4 w-4 text-primary" />
              ) : (
                `#${entry.rank}`
              )}
            </div>
            <Avatar className="h-11 w-11 shrink-0">
              <AvatarImage src={entry.profileImage} alt={entry.name} />
              <AvatarFallback>
                {entry.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-foreground">
                  {entry.name}
                </span>
                {entry.isPaidUser && (
                  <Badge variant="secondary" className="hidden sm:inline-flex">
                    Pro
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{numberFormatter.format(entry.followersCount)} followers</span>
                <span>{numberFormatter.format(entry.postsCount)} projects</span>
                <span>
                  {numberFormatter.format(entry.totalLikesReceived)} likes
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-lg font-semibold text-foreground">
                {numberFormatter.format(entry.referrals)}
              </div>
              <div className="text-xs text-muted-foreground">referrals</div>
            </div>
            {entry.communityUserId && (
              <ArrowUpRight className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary sm:block" />
            )}
          </>
        );

        if (entry.communityUserId) {
          return (
            <Link
              key={entry.userId}
              href={`/web/community/profile/${entry.communityUserId}`}
              className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-background/45 p-3 transition-colors hover:border-primary/35 hover:bg-muted/30"
            >
              {content}
            </Link>
          );
        }

        return (
          <div
            key={entry.userId}
            className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/45 p-3"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
