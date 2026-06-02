/**
 * GitHub Sync Accordion Component
 * Displays linked GitHub user and active git syncs
 */

"use client";

import {
  Github,
  ExternalLink,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Pause,
} from "lucide-react";
import { InfoAccordion } from "./InfoAccordion";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCustomer } from "autumn-js/react";
import Link from "next/link";
import { extractCustomerFeatures } from "@/vly/lib/billing";

export function GitHubSyncAccordion() {
  const { customer } = useCustomer();

  // Check if user has GitHub integration feature access
  const features = customer ? extractCustomerFeatures(customer) : {};
  const hasGitHubAccess = features.github_integration?.has_access ?? false;

  const syncUsage = useQuery(api.github.sync.usage.getGitHubSyncUsage, {
    hasGitHubIntegrationAccess: hasGitHubAccess,
  });

  if (!syncUsage) {
    return null;
  }

  const { connection, active_syncs, has_feature_access } = syncUsage;
  const hasConnection = !!connection;
  const hasSyncs = active_syncs.length > 0;

  // Don't show the accordion if there's no connection, no syncs, and no feature access
  if (!hasConnection && !hasSyncs && !has_feature_access) {
    return null;
  }

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case "synced":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "pending":
        return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
      case "error":
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case "conflict":
        return <AlertCircle className="h-3.5 w-3.5 text-orange-500" />;
      default:
        return null;
    }
  };

  const getSyncStatusText = (status: string) => {
    switch (status) {
      case "synced":
        return "Synced";
      case "pending":
        return "Pending";
      case "error":
        return "Error";
      case "conflict":
        return "Conflict";
      default:
        return status;
    }
  };

  // Summary shows status and count
  const summary = (
    <div className="flex items-center gap-2">
      {has_feature_access ? (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          Enabled
        </span>
      ) : hasSyncs ? (
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
          Paused
        </span>
      ) : (
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
          Needs upgrade
        </span>
      )}
      {hasSyncs && (
        <span className="text-xs font-medium text-zinc-600">
          {active_syncs.length} {active_syncs.length === 1 ? "sync" : "syncs"}
        </span>
      )}
    </div>
  );

  return (
    <InfoAccordion
      value="github-sync"
      title="GitHub Sync"
      description="Manage your GitHub connection and view active repository syncs."
      icon={<Github className="h-4 w-4 text-purple-600" />}
      summary={summary}
    >
      <div className="space-y-4">
        {/* Connected GitHub User */}
        {hasConnection && (
          <div className="rounded-lg border border-zinc-200/50 bg-white/50 p-3">
            <div className="mb-2 text-xs font-medium text-zinc-700">
              Connected Account
            </div>
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-zinc-600" />
              <a
                href={`https://github.com/${connection.github_username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm font-medium text-purple-600 hover:text-purple-700 hover:underline"
              >
                {connection.github_username}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        {/* Feature Access Notices */}
        {!has_feature_access && hasSyncs && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
            <div className="mb-1 flex items-center gap-2">
              <Pause className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-semibold text-orange-900">
                GitHub Sync Paused
              </span>
            </div>
            <p className="text-xs text-orange-800">
              Your GitHub syncs are paused because your current plan doesn't
              include this feature. Upgrade your plan to resume automatic
              syncing.
            </p>
          </div>
        )}

        {!has_feature_access && !hasSyncs && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-1 flex items-center gap-2">
              <Github className="h-4 w-4 text-zinc-600" />
              <span className="text-sm font-semibold text-zinc-900">
                GitHub Sync Not Available
              </span>
            </div>
            <p className="text-xs text-zinc-700">
              GitHub sync is not included in your current plan. Upgrade to a
              plan with GitHub integration to automatically sync your projects
              with GitHub repositories.
            </p>
          </div>
        )}

        {/* Active Syncs */}
        {hasSyncs && (
          <div>
            <div className="mb-2 text-xs font-medium text-zinc-700">
              {has_feature_access ? "Active Syncs" : "Configured Syncs"} (
              {active_syncs.length})
            </div>
            <div className="space-y-1.5">
              {active_syncs.map((sync) => (
                <div
                  key={sync.project_id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                    !has_feature_access
                      ? "border-orange-200/50 bg-orange-50/30"
                      : "border-zinc-200/50 bg-white/50"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/web/project/${sync.semantic_identifier}`}
                        className="truncate text-sm font-medium text-zinc-800 hover:text-purple-600 hover:underline"
                      >
                        {sync.project_name}
                      </Link>
                    </div>
                    <a
                      href={`https://github.com/${sync.repo_owner}/${sync.repo_name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-zinc-600 hover:text-purple-600 hover:underline"
                    >
                      <Github className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        {sync.repo_owner}/{sync.repo_name}
                      </span>
                      <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                    </a>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {!has_feature_access ? (
                      <>
                        <Pause className="h-3.5 w-3.5 text-orange-500" />
                        <span className="text-xs font-medium text-orange-600">
                          Paused
                        </span>
                      </>
                    ) : (
                      <>
                        {getSyncStatusIcon(sync.sync_status)}
                        <span className="text-xs font-medium text-zinc-600">
                          {getSyncStatusText(sync.sync_status)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Connection Warning */}
        {!hasConnection && hasSyncs && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
            <strong>Note:</strong> You have active syncs but no GitHub
            connection. This may indicate a configuration issue.
          </div>
        )}
      </div>
    </InfoAccordion>
  );
}
