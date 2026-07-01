"use client";

import type { FreebuffReferralTier } from "@codebuff/common/constants/freebuff-referral-tiers";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { AppShell } from "@/vly/components/app-shell/AppShell";
// NB: `@/components/*` is aliased to `src/vly/components/*`, so the landing
// footer is imported relatively.
import { CtaFooter } from "../../../components/landing/sections/CtaFooter";
import { Avatar, AvatarFallback, AvatarImage } from "@/vly/components/ui/avatar";
import { Badge } from "@/vly/components/ui/badge";
import { Button } from "@/vly/components/ui/button";
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
  recentReferrals: {
    status: "pending" | "completed";
    createdAt: number;
    /** Why a pending signup hasn't qualified yet; null when qualified or just awaiting verification. */
    blockedReason: "no_github" | "account_too_new" | "needs_activation" | null;
  }[];
  leaderboard: ReferralLeaderboardEntry[];
}

const numberFormatter = new Intl.NumberFormat("en-US");

/** Amber tint for signups that need the friend to do something to qualify. */
const ACTION_BADGE_CLASS =
  "border-amber-500/30 bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400";

/**
 * Map a recent signup to its referrer-facing status: a short badge label, an
 * optional explanation of what's still needed, and the badge styling. Reasons
 * are intentionally about the qualification gate only — never the friend's
 * identity — so the referrer learns what to nudge without seeing who signed up.
 */
function describeReferral(
  referral: {
    status: "pending" | "completed";
    blockedReason: "no_github" | "account_too_new" | "needs_activation" | null;
  },
  minGithubAccountAgeMonths: number,
): {
  label: string;
  detail: string | null;
  variant: "default" | "secondary";
  badgeClass?: string;
} {
  if (referral.status === "completed") {
    return { label: "Qualified", detail: null, variant: "default" };
  }
  switch (referral.blockedReason) {
    // The only state the referrer can act on — nudge the friend to link GitHub.
    case "no_github":
      return {
        label: "Needs GitHub",
        detail:
          "Signed up but hasn't connected a GitHub account yet. Ask them to link GitHub in settings so the referral can qualify.",
        variant: "secondary",
        badgeClass: ACTION_BADGE_CLASS,
      };
    // Account age is re-checked on every sign-in, so this can still qualify
    // later once the account is old enough — not a dead end.
    case "account_too_new":
      return {
        label: "GitHub too new",
        detail: `Their GitHub account is under ${minGithubAccountAgeMonths} months old. Once it's old enough and they've used Freebuff, the referral counts.`,
        variant: "secondary",
      };
    // GitHub checks pass, but the referral only counts once the friend actually
    // uses a product — the one thing the referrer can nudge here.
    case "needs_activation":
      return {
        label: "Needs to use Freebuff",
        detail:
          "Their GitHub account qualifies — the referral counts once they send their first message in any Freebuff product.",
        variant: "secondary",
        badgeClass: ACTION_BADGE_CLASS,
      };
    default:
      return {
        label: "Pending",
        detail: "We'll re-check automatically the next time your friend signs in.",
        variant: "secondary",
      };
  }
}

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
      <AppShell title="Referrals">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-5 py-24 text-center">
          <h1 className="text-lg font-medium text-foreground">Please sign in</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Sign in to get your referral link and see your progress.
          </p>
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
    <AppShell title="Referrals" footer={<CtaFooter />}>
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-20 pt-10 sm:px-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Share Freebuff. Unlock more daily usage.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
            A referral counts when your friend signs up with a GitHub account
            that's at least {status?.minGithubAccountAgeMonths ?? 4} months old{" "}
            <span className="font-medium text-foreground">and uses Freebuff</span>{" "}
            — signing up alone isn't enough. Counted referrals unlock higher
            message limits and Freebuff Web perks.
          </p>
        </header>

        {/* Your link */}
        <section className="mt-10">
          <h2 className="text-[13px] font-medium text-foreground">Your link</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Share this URL anywhere you invite builders.
          </p>
          {shareUrl ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-input px-3 py-2 text-xs text-foreground">
                {shareUrl}
              </code>
              <Button
                onClick={handleCopy}
                size="sm"
                variant="outline"
                className="shrink-0"
              >
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          ) : (
            <Skeleton className="mt-3 h-9 w-full rounded-md" />
          )}
        </section>

        {/* Stats */}
        <section className="mt-10 grid grid-cols-1 gap-6 border-t border-border/60 pt-6 sm:grid-cols-3">
          <Stat
            label="Qualified referrals"
            value={status ? numberFormatter.format(qualifiedCount) : null}
            detail={
              currentTier ? `Tier ${currentTier.tier} unlocked` : "Loading tier"
            }
          />
          <Stat
            label={nextTier ? `Next: Tier ${nextTier.tier}` : "Max tier"}
            value={nextTier ? `${referralsNeeded} more` : "Complete"}
            detail={
              nextTier
                ? `${nextTier.standardModelDailyLimit} standard + ${nextTier.premiumModelDailyLimit} premium / day`
                : "You've unlocked every referral perk"
            }
          />
          <Stat
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

        {/* Tiers & perks */}
        <section className="mt-10 border-t border-border/60 pt-8">
          <h2 className="text-[15px] font-medium text-foreground">
            Tiers &amp; perks
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Progress is based on qualified Freebuff Web referrals.
          </p>
          {!status ? (
            <div className="mt-5 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-muted">
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
                      "flex items-start justify-between gap-4 border-t border-border/60 py-3.5 first:border-t-0",
                      !unlocked && "opacity-55",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">
                          Tier {tier.tier}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {tier.standardModelDailyLimit} standard +{" "}
                        {tier.premiumModelDailyLimit} premium messages/day
                        {tier.removesWatermark ? " · watermark removed" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {tier.referralsRequired === 0
                        ? "Everyone"
                        : index === 1
                          ? `${tier.referralsRequired} referral`
                          : `+${stepFromPrev} (${tier.referralsRequired} total)`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Leaderboard */}
        <section className="mt-10 border-t border-border/60 pt-8">
          <h2 className="text-[15px] font-medium text-foreground">
            Referral leaderboard
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Top referrers with community followers, projects, and likes.
          </p>
          <div className="mt-5">
            <ReferralLeaderboard entries={status?.leaderboard} />
          </div>
        </section>

        {/* Recent signups */}
        <section className="mt-10 border-t border-border/60 pt-8">
          <h2 className="text-[15px] font-medium text-foreground">
            Recent signups
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Signups through your link stay pending until your friend's GitHub
            account passes the age check and they've used Freebuff at least once.
            The status below shows what's still needed.
          </p>
          <div className="mt-5">
            {!status ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : status.recentReferrals.length > 0 ? (
              <div>
                {status.recentReferrals.map((referral, index) => {
                  const display = describeReferral(
                    referral,
                    status.minGithubAccountAgeMonths,
                  );
                  return (
                    <div
                      key={`${referral.createdAt}-${index}`}
                      className="flex flex-col gap-1.5 border-t border-border/60 py-3.5 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                    >
                      <div className="min-w-0">
                        <span className="text-[13px] text-foreground">
                          {new Date(referral.createdAt).toLocaleDateString()}
                        </span>
                        {display.detail && (
                          <p className="mt-0.5 max-w-lg text-xs leading-relaxed text-muted-foreground">
                            {display.detail}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={display.variant}
                        className={cn("shrink-0", display.badgeClass)}
                      >
                        {display.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No signups yet. Share your link to start climbing the
                leaderboard.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | null;
  detail: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {value ?? <Skeleton className="h-7 w-20 rounded" />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
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
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No qualified referrals yet. Be the first to rank.
      </p>
    );
  }

  return (
    <div>
      {entries.map((entry) => {
        const content = (
          <>
            <div className="w-6 shrink-0 text-center font-mono text-[13px] text-muted-foreground">
              {entry.rank}
            </div>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={entry.profileImage} alt={entry.name} />
              <AvatarFallback>
                {entry.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {entry.name}
                </span>
                {entry.isPaidUser && (
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    Pro
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>
                  {numberFormatter.format(entry.followersCount)} followers
                </span>
                <span>{numberFormatter.format(entry.postsCount)} projects</span>
                <span>
                  {numberFormatter.format(entry.totalLikesReceived)} likes
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-[13px] font-medium text-foreground">
                {numberFormatter.format(entry.referrals)}
              </span>
              <span className="ml-1 text-xs text-muted-foreground">
                referrals
              </span>
            </div>
          </>
        );

        if (entry.communityUserId) {
          return (
            <Link
              key={entry.userId}
              href={`/web/community/profile/${entry.communityUserId}`}
              className="flex items-center gap-3 border-t border-border/60 py-3 transition-colors first:border-t-0 hover:text-foreground"
            >
              {content}
            </Link>
          );
        }

        return (
          <div
            key={entry.userId}
            className="flex items-center gap-3 border-t border-border/60 py-3 first:border-t-0"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
