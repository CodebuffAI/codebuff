"use client";

import React from "react";
import { cn } from "@/vly/lib/utils";
import { type TierDefinition, type TierName } from "@/vly/autumn/constants";
import {
  getTierById,
  getNextTier as getNextTierDef,
  formatCredits,
} from "@/vly/autumn/helpers";
import {
  Check,
  Lock,
  Box,
  Database,
  Unplug,
  Users,
  Crown,
  Sparkles,
} from "lucide-react";
import { VlyCoin } from "@/vly/components/ui/vly-coin";
import { ConvexIcon } from "@/vly/components/billing/icons";

interface TierBenefitsProps {
  tierId: TierName;
  className?: string;
}

export function TierBenefits({ tierId, className }: TierBenefitsProps) {
  const currentTier = getTierById(tierId) || getTierById("free")!;
  const nextTier = getNextTierDef(currentTier.id);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Current Tier Features */}
      <div className="rounded-[20px] border border-white/60 bg-gradient-to-br from-white/60 via-white/40 to-purple-50/30 p-8 shadow-xl outline outline-1 outline-white/40">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-[12px] border border-purple-200/60 bg-gradient-to-br from-purple-50/60 to-purple-100/60 p-3 shadow-sm outline outline-1 outline-purple-200/40">
            <Crown className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-['PP_Cirka'] text-2xl font-normal text-zinc-800">
              Your {currentTier.name} Tier Includes
            </h3>
            <p className="text-sm text-zinc-600">
              Everything you get with your selected credits
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Agent Credits */}
          <FeatureCard
            icon={<VlyCoin size="sm" />}
            title="Agent Credits"
            description={`${formatCredits(currentTier.creditsIncluded)} credits per month`}
            isIncluded={true}
          />

          {/* Cloud Workspaces */}
          <FeatureCard
            icon={<Box className="h-5 w-5 text-purple-600" />}
            title="Cloud Workspaces"
            description={getSandboxDescription(currentTier.features)}
            isIncluded={true}
          />

          {/* Real-time Database */}
          <FeatureCard
            icon={<ConvexIcon size="lg" />}
            title="Real-time Database"
            description={getConvexDescription(currentTier.features)}
            isIncluded={true}
          />

          {/* Integrations */}
          {currentTier.features.emailCredits > 0 && (
            <FeatureCard
              icon={<Unplug className="h-5 w-5 text-purple-600" />}
              title="Integrations"
              description={`${currentTier.features.emailCredits} emails, ${currentTier.features.aiCredits} AI credits/month`}
              isIncluded={true}
            />
          )}

          {/* Team Features */}
          {currentTier.features.teamSeats &&
            currentTier.features.teamSeats > 0 && (
              <FeatureCard
                icon={<Users className="h-5 w-5 text-purple-600" />}
                title="Team Collaboration"
                description={`${currentTier.features.teamSeats} seats, ${currentTier.features.totalMembers === "inf" ? "unlimited" : currentTier.features.totalMembers} total members`}
                isIncluded={true}
              />
            )}

          {/* GitHub Integration */}
          <FeatureCard
            icon={
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            }
            title="GitHub Sync"
            description="Push projects to GitHub repositories"
            isIncluded={currentTier.features.github_integration}
          />

          {/* Custom Domains */}
          <FeatureCard
            icon={<Sparkles className="h-5 w-5 text-purple-600" />}
            title="Custom Domains"
            description="Host projects on your own domain"
            isIncluded={currentTier.features.custom_domains}
          />

          {/* Project Editor */}
          <FeatureCard
            icon={
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            }
            title="Project Code Editor"
            description="Full-featured in-browser IDE"
            isIncluded={currentTier.features.project_code_editor}
          />

          {/* Backend Logs Access */}
          <FeatureCard
            icon={<Database className="h-5 w-5 text-purple-600" />}
            title="Database & Logs Access"
            description="View Convex database and logs"
            isIncluded={
              currentTier.features.database_preview &&
              currentTier.features.convex_logs
            }
          />

          {/* White Label */}
          <FeatureCard
            icon={
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            }
            title="Remove Freebuff Web Branding"
            description="White-label your projects"
            isIncluded={currentTier.features.no_vlyai_branding}
          />

          {/* Support */}
          <FeatureCard
            icon={
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            }
            title="In-app Support"
            description="Direct support chat"
            isIncluded={currentTier.features.in_app_support}
          />
        </div>
      </div>

      {/* Next Tier Teaser */}
      {nextTier && (
        <div className="rounded-[20px] border border-zinc-300/60 bg-gradient-to-br from-zinc-50/60 via-white/40 to-zinc-100/30 p-8 shadow-lg outline outline-1 outline-zinc-300/40">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-[12px] border border-zinc-300/60 bg-gradient-to-br from-zinc-100/60 to-zinc-200/60 p-3 shadow-sm outline outline-1 outline-zinc-300/40">
              <Lock className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <h3 className="font-['PP_Cirka'] text-xl font-normal text-zinc-700">
                Unlock {nextTier.name} Tier
              </h3>
              <p className="text-sm text-zinc-600">
                Upgrade to {nextTier.name} tier for these benefits
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {nextTier.highlights.map((highlight, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-lg border border-zinc-200/40 bg-white/40 p-3 text-sm text-zinc-700"
              >
                <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-zinc-400/40 bg-gradient-to-br from-zinc-200/80 to-zinc-300/50">
                  <Lock className="h-3 w-3 text-zinc-600" />
                </div>
                <span>{highlight}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  isIncluded,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  isIncluded: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-[15px] border p-4 transition-all hover:shadow-md",
        isIncluded
          ? "border-white/50 bg-gradient-to-br from-white/60 to-purple-50/40 hover:border-purple-200/60"
          : "border-zinc-300/50 bg-gradient-to-br from-zinc-50/60 to-zinc-100/40 opacity-60",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full",
          isIncluded
            ? "border border-purple-200/60 bg-gradient-to-br from-purple-100/80 to-purple-200/60 text-purple-600"
            : "border border-zinc-300/60 bg-gradient-to-br from-zinc-100/80 to-zinc-200/60 text-zinc-500",
        )}
      >
        {isIncluded ? icon : <Lock className="h-5 w-5" />}
      </div>

      <div className="flex-1">
        <div className="mb-1 flex items-center gap-2">
          <h4
            className={cn(
              "text-sm font-bold",
              isIncluded ? "text-zinc-800" : "text-zinc-600",
            )}
          >
            {title}
          </h4>
          {isIncluded && (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
              <Check className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
        <p
          className={cn(
            "text-xs leading-relaxed",
            isIncluded ? "text-zinc-600" : "text-zinc-500",
          )}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

function getSandboxDescription(features: TierDefinition["features"]): string {
  const sizes = [];
  if (features.sandboxSmall === "inf") sizes.push("Small");
  if (features.sandboxMedium === "inf") sizes.push("Medium");
  if (features.sandboxLarge === "inf") sizes.push("Large");

  if (sizes.length === 0) return "No sandboxes included";
  if (sizes.length === 3) return "Unlimited all sizes";

  return `Unlimited ${sizes.join(", ")} sandboxes`;
}

function getConvexDescription(features: TierDefinition["features"]): string {
  const calls = features.convexFunctionCalls.toLocaleString();
  const compute = features.convexCompute;
  const dbBw = features.convexDatabaseBW;

  return `${calls} calls, ${compute} GB-h compute, ${dbBw} GB bandwidth/month`;
}
