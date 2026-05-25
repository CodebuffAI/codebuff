"use client";

import { SignInButton } from "@/components/auth/AuthComponents";
import { CommunityBadge } from "@/components/community/CommunityBadge";
import { PageLayout } from "@/components/test-landing/PageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConfetti } from "@/hooks/use-confetti";
import { useSignedInUser } from "@/hooks/use-user";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  ChevronDown,
  Copy,
  ExternalLink,
  Gift,
  Loader2,
  Sparkles,
  Star,
  Trophy,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

const STATUS_STYLES: Record<string, string> = {
  incomplete: "bg-zinc-100 text-zinc-700 border-zinc-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  revoked: "bg-red-100 text-red-700 border-red-200",
};

const SPIN_STATUS_STYLES: Record<string, string> = {
  available: "bg-zinc-100 text-zinc-700 border-zinc-200",
  spinning: "bg-amber-100 text-amber-700 border-amber-200",
  awarded: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
  revoked: "bg-red-100 text-red-700 border-red-200",
};

const LEADERBOARD_COLLAPSED_LIMIT = 10;
const LEADERBOARD_EXPANDED_LIMIT = 5000;

function formatCredits(credits: number) {
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(1)}M`.replace(".0M", "M");
  }
  if (credits >= 1_000) {
    return `${(credits / 1_000).toFixed(1)}K`.replace(".0K", "K");
  }
  return credits.toLocaleString();
}

function formatDate(timestamp?: number | null) {
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp).toLocaleString();
}

function getDescriptionPreview(markdown: string, maxLength = 160) {
  const plainText = markdown
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plainText) {
    return "No description provided yet.";
  }

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, maxLength).trimEnd()}...`;
}

function formatSpinSource(source: string) {
  if (source === "manual") {
    return "Admin grant";
  }
  if (source === "referral") {
    return "Referral signup";
  }
  if (source === "welcome") {
    return "Welcome bonus";
  }
  return source;
}

type SubmissionSeed = {
  evidenceText?: string;
  evidenceLinks?: string[];
  evidenceImageIds?: Id<"_storage">[];
  evidenceImageUrls?: string[];
};

type SubmissionDraft = {
  evidenceText: string;
  evidenceImageIds: Id<"_storage">[];
  evidenceImagePreviews: string[];
  uploadingImages: boolean;
  submitting: boolean;
};

type SubmissionDraftBounty = {
  _id: Id<"bounties">;
  submission: SubmissionSeed;
};

function createSubmissionDraft(submission: SubmissionSeed): SubmissionDraft {
  return {
    evidenceText: submission.evidenceText ?? "",
    evidenceImageIds: submission.evidenceImageIds ?? [],
    evidenceImagePreviews: submission.evidenceImageUrls ?? [],
    uploadingImages: false,
    submitting: false,
  };
}

export default function EarnDashboard() {
  const user = useSignedInUser();
  const { fireConfetti } = useConfetti();
  const spinConfig = useQuery(api.earn.getSpinConfig);
  const spinSummary = useQuery(api.earn.getUserSpinSummary);
  const referredUsers = useQuery(api.earn.getReferredUsers);
  const bounties = useQuery(api.earn.getBountiesForUser);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const leaderboard = useQuery(api.earn.getEarnLeaderboard, {
    limit: showFullLeaderboard
      ? LEADERBOARD_EXPANDED_LIMIT
      : LEADERBOARD_COLLAPSED_LIMIT,
  });

  const userCodes = useQuery(api.referrals.getUserReferralCodes);
  const createReferralCode = useMutation(api.referrals.createReferralCode);
  const ensureWelcomeSpin = useMutation(api.earn.ensureWelcomeSpin);
  const adminGrantTestSpin = useMutation(api.earn.adminGrantTestSpin);
  const spinWheel = useMutation(api.earn.spinWheel);
  const submitBountySubmission = useMutation(api.earn.submitBountySubmission);
  const generateUploadUrl = useMutation(api.earn.generateUploadUrl);
  const followUser = useMutation(api.community.followUser);
  const unfollowUser = useMutation(api.community.unfollowUser);
  const [followLoading, setFollowLoading] = useState<string | null>(null);
  const [welcomeSpinEnsuredForUserId, setWelcomeSpinEnsuredForUserId] =
    useState<string | null>(null);

  const [wheelRotation, setWheelRotation] = useState(0);
  const [spinDurationMs, setSpinDurationMs] = useState(6200);
  const [spinning, setSpinning] = useState(false);
  const [grantingTestSpin, setGrantingTestSpin] = useState(false);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSpinResult, setLastSpinResult] = useState<{
    label: string;
    credits: number;
  } | null>(null);

  const [submissionDrafts, setSubmissionDrafts] = useState<
    Record<string, SubmissionDraft>
  >({});
  const [expandedPreviewImage, setExpandedPreviewImage] = useState<{
    url: string;
    alt: string;
  } | null>(null);
  const [copyingReferralLink, setCopyingReferralLink] = useState(false);

  const adminGrantCredits = useAction(api.earn.adminGrantCredits);
  const [grantTarget, setGrantTarget] = useState<{
    userId: Id<"users">;
    name: string;
  } | null>(null);
  const [grantAmount, setGrantAmount] = useState("2000000");
  const [granting, setGranting] = useState(false);

  const primaryCode =
    userCodes?.find((code) => code.active) ?? userCodes?.[0] ?? null;
  const referralUrl = primaryCode?.code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${primaryCode.code}`
    : "";

  const isAdmin = user?.role === "god" || user?.role === "admin";
  const canExpandLeaderboard = showFullLeaderboard || !!leaderboard?.hasMore;
  const maxSpinReward = useMemo(() => {
    if (!spinConfig || spinConfig.rewards.length === 0) {
      return null;
    }
    return spinConfig.rewards.reduce((highest, reward) => {
      return reward.credits > highest.credits ? reward : highest;
    }, spinConfig.rewards[0]);
  }, [spinConfig]);
  const spinHistory = spinSummary?.spinHistory ?? [];

  useEffect(() => {
    if (!user || welcomeSpinEnsuredForUserId === user._id) {
      return;
    }

    ensureWelcomeSpin({})
      .catch((error) => {
        console.error("Failed to ensure welcome spin:", error);
      })
      .finally(() => {
        setWelcomeSpinEnsuredForUserId(user._id);
      });
  }, [ensureWelcomeSpin, user, welcomeSpinEnsuredForUserId]);

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) {
        clearTimeout(spinTimeoutRef.current);
      }
    };
  }, []);

  const getSubmissionDraft = (
    bounty: SubmissionDraftBounty,
  ): SubmissionDraft => {
    return (
      submissionDrafts[bounty._id] ?? createSubmissionDraft(bounty.submission)
    );
  };

  const updateSubmissionDraft = (
    bounty: SubmissionDraftBounty,
    updater: (draft: SubmissionDraft) => SubmissionDraft,
  ) => {
    setSubmissionDrafts((previous) => {
      const current =
        previous[bounty._id] ?? createSubmissionDraft(bounty.submission);
      return {
        ...previous,
        [bounty._id]: updater(current),
      };
    });
  };

  const handleUploadEvidenceImages = async (
    bounty: SubmissionDraftBounty,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    updateSubmissionDraft(bounty, (draft) => ({
      ...draft,
      uploadingImages: true,
    }));
    try {
      const uploadedIds: Id<"_storage">[] = [];
      const previews: string[] = [];

      for (const file of files) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": file.type,
          },
          body: file,
        });

        if (!response.ok) {
          throw new Error("Failed to upload image");
        }

        const { storageId } = await response.json();
        uploadedIds.push(storageId as Id<"_storage">);
        previews.push(URL.createObjectURL(file));
      }

      updateSubmissionDraft(bounty, (draft) => ({
        ...draft,
        evidenceImageIds: [...draft.evidenceImageIds, ...uploadedIds],
        evidenceImagePreviews: [...draft.evidenceImagePreviews, ...previews],
        uploadingImages: false,
      }));
      toast.success(`${files.length} screenshot(s) uploaded`);
    } catch (error) {
      console.error("Failed to upload submission evidence:", error);
      toast.error("Failed to upload screenshots");
      updateSubmissionDraft(bounty, (draft) => ({
        ...draft,
        uploadingImages: false,
      }));
    } finally {
      event.target.value = "";
    }
  };

  const removeEvidenceImage = (
    bounty: SubmissionDraftBounty,
    index: number,
  ) => {
    updateSubmissionDraft(bounty, (draft) => {
      const target = draft.evidenceImagePreviews[index];
      if (target?.startsWith("blob:")) {
        URL.revokeObjectURL(target);
      }
      return {
        ...draft,
        evidenceImageIds: draft.evidenceImageIds.filter(
          (_, idx) => idx !== index,
        ),
        evidenceImagePreviews: draft.evidenceImagePreviews.filter(
          (_, idx) => idx !== index,
        ),
      };
    });
  };

  const handleCopyReferralLink = async () => {
    if (copyingReferralLink) {
      return;
    }

    setCopyingReferralLink(true);
    try {
      let code = primaryCode?.code;

      if (!code) {
        const created = await createReferralCode({});
        code = created.code;
      }

      const url = `${window.location.origin}/?ref=${code}`;
      await navigator.clipboard.writeText(url);
      toast.success("Referral link copied. Each referral grants one spin.");
    } catch (error) {
      console.error("Failed to copy referral link:", error);
      toast.error("Could not copy referral link");
    } finally {
      setCopyingReferralLink(false);
    }
  };

  const handleAdminGrantCredits = async () => {
    if (!grantTarget || granting) {
      return;
    }

    setGranting(true);
    try {
      await adminGrantCredits({
        userId: grantTarget.userId,
        amount: Number(grantAmount),
      });
      toast.success(
        `Granted ${formatCredits(Number(grantAmount))} credits to ${grantTarget.name}`,
      );
      setGrantTarget(null);
      setGrantAmount("2000000");
    } catch (error: any) {
      console.error("Failed to grant credits:", error);
      toast.error(error?.message || "Failed to grant credits");
    } finally {
      setGranting(false);
    }
  };

  const handleSpinWheel = async () => {
    if (!spinConfig || spinning) {
      return;
    }

    if (!spinSummary || spinSummary.availableSpins <= 0) {
      toast.error("No spins available. Refer a user to unlock another spin.");
      return;
    }

    setSpinning(true);
    try {
      const result = await spinWheel({});

      const segmentAngle = 360 / spinConfig.rewards.length;
      const extraTurns = 7 + Math.floor(Math.random() * 3);
      const durationMs = 5600 + Math.floor(Math.random() * 2000);
      const landingJitter = (Math.random() - 0.5) * (segmentAngle * 0.72);
      const targetSegmentCenter =
        result.rewardIndex * segmentAngle + segmentAngle / 2 + landingJitter;

      setSpinDurationMs(durationMs);
      setWheelRotation((previousRotation) => {
        const normalizedCurrentRotation =
          ((previousRotation % 360) + 360) % 360;
        const targetRotationWithinCircle =
          (360 - targetSegmentCenter + 360) % 360;
        const additionalRotation =
          (targetRotationWithinCircle - normalizedCurrentRotation + 360) % 360;
        return previousRotation + 360 * extraTurns + additionalRotation;
      });

      if (spinTimeoutRef.current) {
        clearTimeout(spinTimeoutRef.current);
      }

      spinTimeoutRef.current = setTimeout(() => {
        const rewardText = formatCredits(result.rewardCredits);
        const rewardMillions = Math.max(
          1,
          Math.round(result.rewardCredits / 1_000_000),
        );
        const bonusParticles = Math.min(120, rewardMillions * 2);
        const confettiColors = [
          "#10b981",
          "#34d399",
          "#6ee7b7",
          "#f59e0b",
          "#fbbf24",
        ];

        fireConfetti({
          particleCount: 90 + bonusParticles,
          spread: 68,
          startVelocity: 50,
          origin: { x: 0.2, y: 0.7 },
          colors: confettiColors,
        });
        fireConfetti({
          particleCount: 90 + bonusParticles,
          spread: 68,
          startVelocity: 50,
          origin: { x: 0.8, y: 0.7 },
          colors: confettiColors,
        });
        fireConfetti({
          particleCount: 40 + Math.floor(bonusParticles / 2),
          spread: 95,
          startVelocity: 42,
          origin: { x: 0.5, y: 0.55 },
          colors: confettiColors,
        });

        setLastSpinResult({
          label: rewardText,
          credits: result.rewardCredits,
        });
        setSpinning(false);
        toast.success(`You hit ${rewardText} credits!`);
        spinTimeoutRef.current = null;
      }, durationMs + 120);
    } catch (error: any) {
      console.error("Spin failed:", error);
      toast.error(error?.message || "Spin failed");
      setSpinning(false);
    }
  };

  const handleAdminGrantTestSpin = async () => {
    if (!isAdmin || grantingTestSpin) {
      return;
    }

    setGrantingTestSpin(true);
    try {
      const result = await adminGrantTestSpin({ count: 1 });
      toast.success(
        `Granted ${result.created} test spin. ${result.availableSpins} spins available.`,
      );
    } catch (error: any) {
      console.error("Failed to grant test spin:", error);
      toast.error(error?.message || "Could not grant test spin");
    } finally {
      setGrantingTestSpin(false);
    }
  };

  const handleSubmitBounty = async (bountyId: Id<"bounties">) => {
    const bounty = bounties?.find((item) => item._id === bountyId);
    if (!bounty) {
      return;
    }

    const draft = getSubmissionDraft(bounty);
    updateSubmissionDraft(bounty, (current) => ({
      ...current,
      submitting: true,
    }));

    try {
      await submitBountySubmission({
        bountyId: bounty._id,
        evidenceText: draft.evidenceText.trim() || undefined,
        evidenceImageIds: draft.evidenceImageIds,
      });

      toast.success("Bounty submitted for review");
      updateSubmissionDraft(bounty, (current) => ({
        ...current,
        submitting: false,
      }));
    } catch (error: any) {
      console.error("Failed to submit bounty:", error);
      toast.error(error?.message || "Could not submit bounty");
      updateSubmissionDraft(bounty, (current) => ({
        ...current,
        submitting: false,
      }));
    }
  };

  const wheelGradient = useMemo(() => {
    if (!spinConfig) {
      return "conic-gradient(from 0deg, #d1fae5 0deg, #6ee7b7 360deg)";
    }

    const segmentSize = 360 / spinConfig.rewards.length;
    const palette = [
      "#fef3c7",
      "#fde68a",
      "#bbf7d0",
      "#86efac",
      "#a7f3d0",
      "#67e8f9",
      "#bfdbfe",
      "#ddd6fe",
    ];

    return `conic-gradient(${spinConfig.rewards
      .map((_, index) => {
        const start = index * segmentSize;
        const end = start + segmentSize;
        const color = palette[index % palette.length];
        return `${color} ${start}deg ${end}deg`;
      })
      .join(",")})`;
  }, [spinConfig]);

  if (user === undefined) {
    return (
      <PageLayout showHome={true} showParallax={false}>
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
          <Skeleton className="h-12 w-96" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageLayout>
    );
  }

  if (user === null) {
    return (
      <PageLayout showHome={true} showParallax={false}>
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <Badge className="mb-4 border-amber-300 bg-amber-100 text-amber-700">
            limited time only
          </Badge>
          <h1 className="mb-3 text-4xl font-semibold lowercase text-zinc-900">
            earn unlimited free credits.
          </h1>
          <p className="mb-8 text-zinc-600">
            Sign in to earn credits through referrals and bounties. Spins can
            award up to 100M credits.
          </p>
          <SignInButton mode="modal" asChild>
            <Button className="rounded-full bg-emerald-600 px-8 text-white hover:bg-emerald-700">
              Sign in to start earning
            </Button>
          </SignInButton>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout showHome={true} showParallax={false}>
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
        <section className="rounded-3xl border border-emerald-100 bg-white/95 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-3">
              <Badge className="w-fit border-amber-300 bg-amber-100 text-amber-700">
                limited time only
              </Badge>
              <h1 className="text-4xl font-semibold lowercase tracking-tight text-zinc-900">
                earn unlimited free credits.
              </h1>
              <p className="text-zinc-600">
                Earn credits through referrals and bounties. Each successful
                referral gives you a spin, and each spin can award up to{" "}
                {maxSpinReward?.label ?? "100M"} credits.
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                <span className="rounded-full bg-emerald-50 px-3 py-1">
                  One free spin per user
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1">
                  No purchase necessary
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1">
                  earn unlimited spins, unlimited rewards
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  className="border-emerald-300"
                  disabled={grantingTestSpin}
                  onClick={handleAdminGrantTestSpin}
                >
                  {grantingTestSpin ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Granting test spin...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Grant test spin
                    </>
                  )}
                </Button>
              )}
              {isAdmin && (
                <Button
                  asChild
                  variant="outline"
                  className="border-emerald-300"
                >
                  <Link
                    href="/earn/admin"
                    className="inline-flex items-center gap-2"
                  >
                    Manage Earn Admin
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  Spin The Referral Wheel
                </h2>
                <p className="text-sm text-zinc-600">
                  Spin to win between 1M and 100M credits.
                </p>
              </div>
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                {spinSummary?.availableSpins ?? 0} spins available
              </Badge>
            </div>

            <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
              <div className="relative mx-auto h-[320px] w-[320px]">
                <div className="absolute left-1/2 top-0 z-20 h-0 w-0 -translate-x-1/2 border-l-[16px] border-r-[16px] border-t-[28px] border-l-transparent border-r-transparent border-t-emerald-600" />

                <div
                  className="relative h-full w-full rounded-full border-[10px] border-emerald-200 shadow-[inset_0_0_0_6px_rgba(255,255,255,0.8)]"
                  style={{
                    transform: `rotate(${wheelRotation}deg)`,
                    background: wheelGradient,
                    transitionProperty: "transform",
                    transitionDuration: `${spinDurationMs}ms`,
                    transitionTimingFunction:
                      "cubic-bezier(0.09, 0.88, 0.2, 1)",
                    willChange: "transform",
                  }}
                >
                  {spinConfig?.rewards.map((reward) => {
                    const angle =
                      reward.index * (360 / spinConfig.rewards.length) +
                      360 / spinConfig.rewards.length / 2;
                    return (
                      <div
                        key={reward.index}
                        className="pointer-events-none absolute left-1/2 top-1/2 origin-center"
                        style={{
                          transform: `rotate(${angle}deg) translateY(-124px) rotate(-${angle}deg)`,
                        }}
                      >
                        <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-xs font-semibold text-zinc-700 shadow-sm">
                          {formatCredits(reward.credits)}
                        </span>
                      </div>
                    );
                  })}

                  <div className="absolute left-1/2 top-1/2 z-10 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-emerald-600 text-white shadow-lg">
                    <Star className="h-8 w-8" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-sm text-zinc-700">
                    Press <span className="font-semibold">Spin</span>. The wheel
                    lands on your credit reward.
                  </p>
                </div>

                {lastSpinResult && (
                  <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                    <p className="text-sm text-zinc-600">Last reward</p>
                    <p className="text-2xl font-semibold text-emerald-700">
                      {lastSpinResult.label} credits
                    </p>
                  </div>
                )}

                <div className="space-y-3 rounded-2xl border border-zinc-200 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Referral Link
                  </p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={referralUrl}
                      placeholder="Create your referral code"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="border-zinc-300"
                      onClick={handleCopyReferralLink}
                      disabled={copyingReferralLink}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Each successful referral grants one additional spin.
                  </p>
                </div>
              </div>
            </div>

            <div className="mx-auto mt-6 w-full max-w-2xl">
              <Button
                onClick={handleSpinWheel}
                disabled={spinning || (spinSummary?.availableSpins ?? 0) <= 0}
                className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700 md:text-lg"
              >
                {spinning ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Spinning...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Spin The Wheel
                  </>
                )}
              </Button>
              <p className="mt-2 text-center text-xs text-zinc-500">
                No purchase necessary. One free spin per user.
              </p>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <details className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-4 shadow-sm">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
                  Referrals gotten ({referredUsers?.length ?? 0})
                </summary>
                <p className="mt-1 text-xs text-zinc-500">
                  People who signed up using your referral link.
                </p>
                <div className="mt-3 space-y-2">
                  {referredUsers?.length ? (
                    referredUsers.map((referredUser) => (
                      <div
                        key={referredUser._id}
                        className="rounded-xl border border-zinc-200 bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-900">
                              {referredUser.name || "Unnamed user"}
                            </p>
                            <p className="truncate text-xs text-zinc-500">
                              {referredUser.email || "No email available"}
                            </p>
                          </div>
                          <CommunityBadge
                            communityBadgeTier={referredUser.communityBadgeTier}
                            size="sm"
                          />
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-zinc-600 md:grid-cols-2">
                          <p>Joined: {formatDate(referredUser.joinedAt)}</p>
                          <p>
                            Code used: {referredUser.referralCodeUsed ?? "-"}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
                      No referrals yet.
                    </div>
                  )}
                </div>
              </details>

              <details className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-4 shadow-sm">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
                  Spin history ({spinHistory.length})
                </summary>
                <p className="mt-1 text-xs text-zinc-500">
                  Full history across referral, welcome, and admin-granted
                  spins.
                </p>
                <div className="mt-3 space-y-2">
                  {spinHistory.length ? (
                    spinHistory.map((spin) => (
                      <div
                        key={spin._id}
                        className="rounded-xl border border-zinc-200 bg-white p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-zinc-900">
                            {formatSpinSource(spin.source)}
                          </p>
                          <Badge
                            className={`border ${SPIN_STATUS_STYLES[spin.status] ?? SPIN_STATUS_STYLES.available}`}
                          >
                            {spin.status}
                          </Badge>
                        </div>
                        {spin.referredUserName && (
                          <p className="mt-1 text-xs text-zinc-600">
                            Referred: {spin.referredUserName}
                            {spin.referredUserEmail
                              ? ` (${spin.referredUserEmail})`
                              : ""}
                          </p>
                        )}
                        <div className="mt-2 grid gap-1 text-xs text-zinc-600 md:grid-cols-2">
                          <p>
                            Reward:{" "}
                            {spin.awardedCredits > 0
                              ? formatCredits(spin.awardedCredits)
                              : (spin.rewardLabel ?? "-")}
                          </p>
                          <p>Granted: {formatDate(spin.grantedAt)}</p>
                          <p>Spun: {formatDate(spin.spunAt)}</p>
                          <p>Awarded: {formatDate(spin.awardedAt)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
                      No spins yet.
                    </div>
                  )}
                </div>
              </details>
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  Leaderboard
                </h2>
                <p className="text-sm text-zinc-600">
                  Credits earned from bounties and referral spins.
                </p>
              </div>
              <Trophy className="h-5 w-5 text-emerald-600" />
            </div>

            <Alert className="mb-4 border-emerald-200 bg-emerald-50">
              <AlertDescription className="text-emerald-800">
                Additional points will be given to the top users for each month.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              {leaderboard?.entries.map((entry: any) => (
                <div
                  key={entry.userId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-7 text-center text-sm font-semibold text-zinc-500">
                      #{entry.rank}
                    </div>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={entry.profileImage ?? undefined} />
                      <AvatarFallback>
                        {entry.name?.charAt(0).toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <Link
                        href={`/community/profile/${entry.userId}`}
                        className="truncate text-sm font-medium text-zinc-900 hover:text-emerald-700 hover:underline"
                      >
                        {entry.name}
                      </Link>
                      <div className="flex items-center gap-2">
                        <CommunityBadge
                          communityBadgeTier={entry.communityBadgeTier}
                          size="sm"
                        />
                        <span className="flex items-center gap-0.5 text-xs text-zinc-500">
                          <Users className="h-3 w-3" />
                          {entry.followersCount}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!entry.isViewer && user && (
                      <Button
                        variant="outline"
                        size="sm"
                        className={
                          entry.isFollowing
                            ? "h-8 border-zinc-300 px-2 text-zinc-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                            : "h-8 border-emerald-300 px-2 text-emerald-700 hover:bg-emerald-50"
                        }
                        disabled={followLoading === entry.userId}
                        onClick={async () => {
                          setFollowLoading(entry.userId);
                          try {
                            if (entry.isFollowing) {
                              await unfollowUser({ userId: entry.userId });
                            } else {
                              await followUser({ userId: entry.userId });
                            }
                          } catch {
                            toast.error("Failed to update follow status");
                          } finally {
                            setFollowLoading(null);
                          }
                        }}
                      >
                        {followLoading === entry.userId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : entry.isFollowing ? (
                          <>
                            <UserMinus className="mr-1 h-3.5 w-3.5" />
                            Following
                          </>
                        ) : (
                          <>
                            <UserPlus className="mr-1 h-3.5 w-3.5" />
                            Follow
                          </>
                        )}
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-emerald-300 px-2 text-emerald-700 hover:bg-emerald-50"
                        onClick={() =>
                          setGrantTarget({
                            userId: entry.userId,
                            name: entry.name,
                          })
                        }
                      >
                        <Gift className="mr-1 h-3.5 w-3.5" />
                        Grant
                      </Button>
                    )}
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-700">
                        {formatCredits(entry.totalCredits)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {entry.referralsCount} referrals
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                className="border-zinc-300"
                disabled={!canExpandLeaderboard && !showFullLeaderboard}
                onClick={() => setShowFullLeaderboard((previous) => !previous)}
              >
                {canExpandLeaderboard
                  ? showFullLeaderboard
                    ? "Collapse"
                    : "Expand leaderboard"
                  : "All entries shown"}
              </Button>
              <div className="text-right text-xs text-zinc-500">
                <p>
                  Showing {leaderboard?.entries.length ?? 0}
                  {showFullLeaderboard && leaderboard?.hasMore ? "+" : ""}
                </p>
                {leaderboard?.viewerPosition && (
                  <p>Your rank: #{leaderboard.viewerPosition.rank}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-2xl font-semibold text-zinc-900">Bounties</h2>
              <p className="text-sm text-zinc-600">
                Complete admin-created tasks and submit evidence for approval.
              </p>
            </div>
            <Badge className="border-zinc-200 bg-zinc-100 text-zinc-700">
              {bounties?.length ?? 0} active
            </Badge>
          </div>

          <div className="space-y-4">
            {bounties?.map((bounty) => {
              const submissionDraft = getSubmissionDraft(bounty);
              const previewImageUrl = bounty.previewImageUrl;
              const submissionLocked =
                bounty.submission.status !== "incomplete";
              const submissionLockedMessage =
                bounty.submission.status === "pending"
                  ? "You already submitted this bounty. It's currently pending admin review."
                  : bounty.submission.status === "approved"
                    ? "You already submitted this bounty and it has been approved."
                    : bounty.submission.status === "rejected"
                      ? "You already submitted this bounty and it was reviewed as rejected."
                      : bounty.submission.status === "revoked"
                        ? "You already submitted this bounty and that submission was revoked."
                        : "You already submitted this bounty.";

              return (
                <details
                  key={bounty._id}
                  className="group rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 open:border-emerald-200 open:bg-emerald-50/30"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start gap-4">
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <ChevronDown className="h-4 w-4 -rotate-90 transition-transform duration-200 group-open:rotate-0" />
                      </div>

                      {previewImageUrl && (
                        <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-white transition-all duration-200 group-open:h-16 group-open:w-24">
                          <img
                            src={previewImageUrl}
                            alt={`${bounty.title} preview`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-semibold text-zinc-900">
                          {bounty.title}
                        </h3>
                        <p className="text-sm text-zinc-600">
                          {getDescriptionPreview(bounty.description)}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                            {formatCredits(bounty.rewardCredits)} credits
                          </Badge>
                          <Badge
                            className={`border ${STATUS_STYLES[bounty.submission.status] ?? STATUS_STYLES.incomplete}`}
                          >
                            {bounty.submission.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </summary>

                  <div className="mt-4 border-t border-zinc-200 pt-4">
                    <p className="mb-4 text-sm text-zinc-600">
                      Review full requirements and submit evidence when
                      complete.
                    </p>

                    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                      <div className="space-y-3">
                        <div className="prose prose-sm max-w-none text-zinc-700">
                          <ReactMarkdown
                            components={{
                              a: ({ ...props }) => (
                                <a
                                  {...props}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-700 underline"
                                />
                              ),
                            }}
                          >
                            {bounty.description}
                          </ReactMarkdown>
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-white p-3">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Evidence Required
                          </p>
                          <p className="text-sm text-zinc-700">
                            {bounty.evidenceRequirements}
                          </p>
                          {bounty.links.length > 0 && (
                            <div className="mt-3 space-y-1">
                              {bounty.links.map((link) => (
                                <a
                                  key={link}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-sm text-emerald-700 underline"
                                >
                                  {link}
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>

                        {bounty.submission.status === "rejected" &&
                          bounty.submission.adminReviewNote && (
                            <Alert className="border-rose-200 bg-rose-50">
                              <AlertDescription className="text-rose-700">
                                Admin feedback:{" "}
                                {bounty.submission.adminReviewNote}
                              </AlertDescription>
                            </Alert>
                          )}

                        {bounty.submission.status === "approved" && (
                          <Alert className="border-emerald-200 bg-emerald-50">
                            <AlertDescription className="text-emerald-700">
                              Approved on{" "}
                              {formatDate(bounty.submission.reviewedAt)}.
                              Credits earned:{" "}
                              {formatCredits(bounty.submission.awardedCredits)}.
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="space-y-4 rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-[0_10px_24px_rgba(16,185,129,0.14)]">
                          <div className="rounded-xl border border-emerald-300 bg-white/90 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                  Bounty Submission
                                </p>
                                <p className="text-base font-semibold text-zinc-900">
                                  Submit your evidence here
                                </p>
                                <p className="text-xs text-zinc-600">
                                  Fill out all fields below, then submit for
                                  admin review.
                                </p>
                              </div>
                              <div className="ml-auto flex items-center gap-2 self-start">
                                <Badge className="border-emerald-300 bg-emerald-100 text-emerald-700">
                                  submit here
                                </Badge>
                                <Badge
                                  className={`border ${STATUS_STYLES[bounty.submission.status] ?? STATUS_STYLES.incomplete}`}
                                >
                                  {bounty.submission.status}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          {submissionLocked &&
                            bounty.submission.status !== "pending" && (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                {submissionLockedMessage} Additional submissions
                                are disabled.
                              </div>
                            )}

                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-zinc-900">
                              1. Screenshots
                            </p>
                            <label
                              className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 px-4 py-4 text-sm font-medium ${
                                submissionLocked
                                  ? "cursor-not-allowed bg-zinc-100 text-zinc-500"
                                  : "cursor-pointer bg-emerald-50/50 text-emerald-800 hover:bg-emerald-100/60"
                              }`}
                            >
                              {submissionDraft.uploadingImages ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                              {submissionDraft.uploadingImages
                                ? "Uploading..."
                                : "Upload screenshot evidence"}
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(event) =>
                                  handleUploadEvidenceImages(bounty, event)
                                }
                                disabled={
                                  submissionLocked ||
                                  submissionDraft.uploadingImages
                                }
                              />
                            </label>

                            {submissionDraft.evidenceImagePreviews.length >
                              0 && (
                              <div className="grid grid-cols-3 gap-2">
                                {submissionDraft.evidenceImagePreviews.map(
                                  (preview, index) => (
                                    <div
                                      key={`${preview}-${index}`}
                                      className="relative overflow-hidden rounded-lg border border-zinc-200"
                                    >
                                      <img
                                        src={preview}
                                        alt={`Evidence ${index + 1}`}
                                        className="h-24 w-full object-cover"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeEvidenceImage(bounty, index)
                                        }
                                        disabled={submissionLocked}
                                        className={`absolute right-1 top-1 rounded-full p-1 text-white ${
                                          submissionLocked
                                            ? "cursor-not-allowed bg-zinc-500/60"
                                            : "bg-black/60"
                                        }`}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ),
                                )}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-zinc-900">
                              2. Additional notes
                            </p>
                            <Textarea
                              value={submissionDraft.evidenceText}
                              onChange={(event) =>
                                updateSubmissionDraft(bounty, (draft) => ({
                                  ...draft,
                                  evidenceText: event.target.value,
                                }))
                              }
                              placeholder="Add brief context about what you completed."
                              rows={4}
                              disabled={submissionLocked}
                            />
                          </div>

                          <Button
                            type="button"
                            onClick={() => handleSubmitBounty(bounty._id)}
                            disabled={
                              submissionLocked ||
                              submissionDraft.submitting ||
                              submissionDraft.uploadingImages
                            }
                            className="h-14 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
                          >
                            {submissionLocked
                              ? "Submission already sent"
                              : "Submit bounty evidence"}
                          </Button>
                          <p className="text-center text-xs text-zinc-600">
                            This sends your submission to admins for approval.{" "}
                            <span className="text-amber-700">
                              Do not fake submissions. Fraud may result in bans
                              or credit removals.
                            </span>
                          </p>
                        </div>
                      </div>

                      {previewImageUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPreviewImage({
                              url: previewImageUrl,
                              alt: bounty.title,
                            })
                          }
                          className="relative h-40 w-full overflow-hidden rounded-xl border border-zinc-200 transition hover:shadow-md lg:w-56"
                        >
                          <img
                            src={previewImageUrl}
                            alt={bounty.title}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}

            {!bounties?.length && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
                No active bounties yet.
              </div>
            )}

            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-emerald-50/60 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-900">
                    More bounties coming soon
                  </p>
                  <p className="text-sm text-zinc-600">
                    New social, review, and community bounties are being added
                    regularly.
                  </p>
                  <p className="text-xs text-zinc-500">
                    Check back often to claim more credits.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Referrals
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">
              {referredUsers?.length ?? 0}
            </p>
            <p className="text-sm text-zinc-600">successful signups</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Available Spins
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">
              {spinSummary?.availableSpins ?? 0}
            </p>
            <p className="text-sm text-zinc-600">ready to spin now</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Referral Credits
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">
              {formatCredits(spinSummary?.referralCreditsEarned ?? 0)}
            </p>
            <p className="text-sm text-zinc-600">from completed spins</p>
          </div>
        </section>
      </div>

      <Dialog
        open={!!grantTarget}
        onOpenChange={(open) => {
          if (!open) {
            setGrantTarget(null);
            setGrantAmount("2000000");
            setGranting(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant credits</DialogTitle>
            <DialogDescription>
              Grant credits to {grantTarget?.name ?? "user"} via earn reward
              products.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-800">Credit amount</p>
              <select
                value={grantAmount}
                onChange={(event) => setGrantAmount(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              >
                <option value="1000000">1M credits</option>
                <option value="2000000">2M credits</option>
                <option value="4000000">4M credits</option>
                <option value="5000000">5M credits</option>
                <option value="10000000">10M credits</option>
                <option value="20000000">20M credits</option>
                <option value="30000000">30M credits</option>
                <option value="50000000">50M credits</option>
                <option value="70000000">70M credits</option>
                <option value="100000000">100M credits</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setGrantTarget(null);
                  setGrantAmount("2000000");
                }}
                disabled={granting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdminGrantCredits}
                disabled={granting}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {granting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Granting...
                  </>
                ) : (
                  <>
                    <Gift className="mr-2 h-4 w-4" />
                    Grant {formatCredits(Number(grantAmount))} credits
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!expandedPreviewImage}
        onOpenChange={(open) => !open && setExpandedPreviewImage(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Bounty preview image</DialogTitle>
            <DialogDescription>Expanded bounty preview image</DialogDescription>
          </DialogHeader>
          {expandedPreviewImage && (
            <img
              src={expandedPreviewImage.url}
              alt={expandedPreviewImage.alt}
              className="max-h-[90vh] w-full bg-zinc-950 object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
