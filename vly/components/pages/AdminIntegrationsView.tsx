"use client";

import { useEffect, useRef } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  Package,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const getApprovalStatusBadge = (status?: string) => {
  const s = status || "pending";
  const colors = {
    pending: "bg-yellow-500",
    approved: "bg-green-500",
    rejected: "bg-red-500",
  };
  return (
    <Badge className={`${colors[s as keyof typeof colors]} text-white`}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </Badge>
  );
};

interface StatusFilterCardProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  colorClass?: string;
  onClick: () => void;
}

function StatusFilterCard({
  label,
  icon,
  isActive,
  colorClass,
  onClick,
}: StatusFilterCardProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer p-4 transition-all hover:shadow-md",
        isActive && "ring-2 ring-primary ring-offset-2",
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <p className={cn("text-sm font-medium", colorClass)}>{label}</p>
        {icon}
      </div>
    </Card>
  );
}

interface AdminIntegrationsViewProps {
  integrationStatusFilter: string;
  setIntegrationStatusFilter: (value: string) => void;
  setSelectedIntegration: (integration: any) => void;
}

export function AdminIntegrationsView({
  integrationStatusFilter,
  setIntegrationStatusFilter,
  setSelectedIntegration,
}: AdminIntegrationsViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Paginated query for the list
  const {
    results: integrations,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.integrations.listAllUserGeneratedIntegrations,
    integrationStatusFilter === "all"
      ? {}
      : {
          approval_status: integrationStatusFilter as
            | "pending"
            | "approved"
            | "rejected",
        },
    { initialNumItems: 20 },
  );

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";

  useEffect(() => {
    if (!sentinelRef.current || !canLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoadMore) {
          loadMore(20);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [canLoadMore, loadMore]);

  return (
    <>
      {/* Status Filter Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatusFilterCard
          label="All"
          icon={<Package className="h-6 w-6 text-muted-foreground" />}
          isActive={integrationStatusFilter === "all"}
          onClick={() => setIntegrationStatusFilter("all")}
        />
        <StatusFilterCard
          label="Pending"
          icon={<AlertCircle className="h-6 w-6 text-yellow-600" />}
          isActive={integrationStatusFilter === "pending"}
          colorClass="text-yellow-600"
          onClick={() => setIntegrationStatusFilter("pending")}
        />
        <StatusFilterCard
          label="Approved"
          icon={<CheckCircle className="h-6 w-6 text-green-600" />}
          isActive={integrationStatusFilter === "approved"}
          colorClass="text-green-600"
          onClick={() => setIntegrationStatusFilter("approved")}
        />
        <StatusFilterCard
          label="Rejected"
          icon={<XCircle className="h-6 w-6 text-red-600" />}
          isActive={integrationStatusFilter === "rejected"}
          colorClass="text-red-600"
          onClick={() => setIntegrationStatusFilter("rejected")}
        />
      </div>

      <p className="mb-6 text-muted-foreground">
        {isLoading
          ? "Loading..."
          : `${integrations.length} integration${integrations.length !== 1 ? "s" : ""} loaded`}
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-muted-foreground"
          >
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading integrations...
          </motion.div>
        </div>
      ) : integrations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-16 text-center"
        >
          <p className="text-muted-foreground">No integrations found</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {integrations.map((integration, index) => (
            <motion.div
              key={integration._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.05, 0.5) }}
            >
              <Card
                className="cursor-pointer p-6 transition-colors hover:border-foreground/20"
                onClick={() => setSelectedIntegration(integration)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      {integration.cover_image && (
                        <img
                          src={integration.cover_image}
                          alt={integration.title}
                          className="h-8 w-8 rounded"
                        />
                      )}
                      <h3 className="font-semibold">{integration.title}</h3>
                      {getApprovalStatusBadge(integration.approval_status)}
                    </div>
                    <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                      {integration.description}
                    </p>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {integration.tags.map((tag: string) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{integration.type}</span>
                      <span>•</span>
                      <span>
                        {integration.env_variables?.length || 0} env vars
                      </span>
                      <span>•</span>
                      <span>
                        Updated{" "}
                        {new Date(
                          integration.last_updated,
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}

          <div ref={sentinelRef} className="h-4" />

          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Manual load more button as fallback */}
          {canLoadMore && !isLoadingMore && (
            <div className="flex justify-center py-4">
              <Button variant="outline" onClick={() => loadMore(20)}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
